import { describe, it, expect } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzleAdapter } from "../../src/adapters/drizzle";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/drizzle/adapter",
);

// `dir` is either a fixturesDir-relative name ("postgres-basic") or an
// absolute path (a per-test mkdtempSync dir, for the error-case tests below).
async function extractFixture(dir: string, filename = "drizzle.config.ts") {
  const cwd = isAbsolute(dir) ? dir : join(fixturesDir, dir);
  const entry = await drizzleAdapter.resolveEntry(filename, cwd);
  return drizzleAdapter.extract(entry);
}

describe("drizzleAdapter.resolveEntry", () => {
  it("resolves a relative path against cwd into an absolute path", async () => {
    const entry = await drizzleAdapter.resolveEntry(
      "drizzle.config.ts",
      join(fixturesDir, "postgres-basic"),
    );
    expect(entry.path).toBe(
      join(fixturesDir, "postgres-basic", "drizzle.config.ts"),
    );
  });

  it("throws when the path is a directory, not a file", async () => {
    await expect(
      drizzleAdapter.resolveEntry("postgres-basic", fixturesDir),
    ).rejects.toThrow(/not a file/);
  });
});

describe("drizzleAdapter.extract — postgres dialect", () => {
  it("extracts every exported table, including the implicit many-to-many junction table", async () => {
    const model = await extractFixture("postgres-basic");
    expect(model.entities.map((e) => e.name).toSorted()).toEqual([
      "post_tags",
      "posts",
      "profiles",
      "tags",
      "users",
    ]);
  });

  it("maps column types, primary keys, and literal defaults", async () => {
    const model = await extractFixture("postgres-basic");
    const posts = model.entities.find((e) => e.name === "posts")!;
    const id = posts.fields.find((f) => f.name === "id")!;
    const title = posts.fields.find((f) => f.name === "title")!;
    const published = posts.fields.find((f) => f.name === "published")!;
    expect(id.isPrimaryKey).toBe(true);
    expect(id.isNullable).toBe(false);
    expect(id.type).toBe("int");
    expect(title.type).toBe("string");
    expect(published.type).toBe("boolean");
    expect(published.defaultValue).toBe("false");
  });

  it("resolves a raw `sql` default expression via the dialect", async () => {
    const model = await extractFixture("postgres-basic");
    const users = model.entities.find((e) => e.name === "users")!;
    const createdAt = users.fields.find((f) => f.name === "created_at")!;
    expect(createdAt.defaultValue).toBe("now()");
  });

  it("marks a `.enum()` column as enum with its declared values", async () => {
    const model = await extractFixture("postgres-basic");
    const users = model.entities.find((e) => e.name === "users")!;
    const role = users.fields.find((f) => f.name === "role")!;
    expect(role.type).toBe("enum");
    expect(role.enumValues).toEqual(["admin", "member"]);
  });

  // Postgres's `pgEnum()` backs a real, named, reusable DB type — unlike
  // MySQL's inline enums (see the mysql dialect describe block below),
  // `getSQLType()` here IS a stable name, so it should be used as-is rather
  // than synthesized.
  it("keeps the real pgEnum type name as nativeType, not a synthesized one", async () => {
    const model = await extractFixture("postgres-basic");
    const users = model.entities.find((e) => e.name === "users")!;
    const role = users.fields.find((f) => f.name === "role")!;
    expect(role.nativeType).toBe("role");
  });

  it("detects foreign key columns from `.references()`", async () => {
    const model = await extractFixture("postgres-basic");
    const posts = model.entities.find((e) => e.name === "posts")!;
    const authorId = posts.fields.find((f) => f.name === "author_id")!;
    expect(authorId.isForeignKey).toBe(true);
  });

  it("unwraps a `.array()` column to its element's canonical type and sets isList, without the wrapper's own \"[]\" suffix leaking into nativeType (#5a)", async () => {
    const model = await extractFixture("postgres-basic");
    const posts = model.entities.find((e) => e.name === "posts")!;
    const labels = posts.fields.find((f) => f.name === "labels")!;
    expect(labels.isList).toBe(true);
    expect(labels.type).toBe("string");
    expect(labels.nativeType).toBe("text");
  });

  it("unwraps a `.array()` of a named pgEnum via `.baseColumn`, since enumValues/columnType only live there, not on the array wrapper (#5a)", async () => {
    const model = await extractFixture("postgres-basic");
    const posts = model.entities.find((e) => e.name === "posts")!;
    const roleTags = posts.fields.find((f) => f.name === "role_tags")!;
    expect(roleTags.isList).toBe(true);
    expect(roleTags.type).toBe("enum");
    expect(roleTags.enumValues).toEqual(["admin", "member"]);
    // The real pgEnum name, not a synthesized enum_<table>_<column> — same
    // "keep the real name" rule the non-array pgEnum column already gets.
    expect(roleTags.nativeType).toBe("role");
  });

  it("detects a single-column unique constraint from `.unique()`", async () => {
    const model = await extractFixture("postgres-basic");
    const users = model.entities.find((e) => e.name === "users")!;
    const email = users.fields.find((f) => f.name === "email")!;
    expect(email.isUnique).toBe(true);
  });

  it("builds a 1-n relation for an ordinary FK, parent on `from`", async () => {
    const model = await extractFixture("postgres-basic");
    const userToPost = model.relations.filter(
      (r) => r.type === "1-n" && r.from === "users" && r.to === "posts",
    );
    expect(userToPost).toHaveLength(1);
    expect(userToPost[0].toColumn).toBe("author_id");
    expect(userToPost[0].fromColumn).toBe("id");
    expect(userToPost[0].onDelete).toBe("cascade");
    expect(userToPost[0].onUpdate).toBe("cascade");
    // The fixture's author_id has no `.notNull()`.
    expect(userToPost[0].isFromOptional).toBe(true);
  });

  it("builds a 1-1 relation when the FK column is also unique", async () => {
    const model = await extractFixture("postgres-basic");
    const userToProfile = model.relations.filter(
      (r) => r.type === "1-1" && r.from === "users" && r.to === "profiles",
    );
    expect(userToProfile).toHaveLength(1);
    expect(userToProfile[0].onDelete).toBe("cascade");
    // The fixture's user_id is `.notNull()`.
    expect(userToProfile[0].isFromOptional).toBe(false);
  });

  it("builds a 1-1 relation when a composite FK is covered by a composite unique constraint", async () => {
    const model = await extractFixture("composite-fk-unique");
    const rel = model.relations.find(
      (r) => r.from === "users" && r.to === "posts",
    )!;
    expect(rel.type).toBe("1-1");
    expect(rel.fromColumn).toBe("tenant_id");
    expect(rel.toColumn).toBe("author_tenant_id");
  });

  it("leaves an implicit many-to-many junction table's two FKs as separate 1-n relations", async () => {
    const model = await extractFixture("postgres-basic");
    const toJunction = model.relations.filter((r) => r.to === "post_tags");
    expect(toJunction.map((r) => r.from).toSorted()).toEqual(["posts", "tags"]);
    expect(toJunction.every((r) => r.type === "1-n")).toBe(true);
  });
});

describe("drizzleAdapter.extract — composite keys and plain indexes", () => {
  it("carries composite PK and multi-column unique, keeping single-column unique on the field", async () => {
    const model = await extractFixture("composite");
    const postTags = model.entities.find((e) => e.name === "post_tags")!;

    expect(postTags.primaryKey?.toSorted()).toEqual(
      ["post_id", "tag_id"].toSorted(),
    );
    expect(postTags.uniques).toEqual([["tag_id", "added_by"]]);
    expect(
      postTags.fields.find((f) => f.name === "post_id")?.isPrimaryKey,
    ).toBe(true);
    expect(postTags.fields.find((f) => f.name === "slug")?.isUnique).toBe(true);
  });

  it("carries a non-unique index() declaration as a plain index", async () => {
    const model = await extractFixture("composite");
    const postTags = model.entities.find((e) => e.name === "post_tags")!;
    expect(postTags.indexes).toEqual([
      { fields: ["added_by"], name: "addedby_idx" },
    ]);
  });
});

describe("drizzleAdapter.extract — canonical type mapping and default values", () => {
  it("maps json/jsonb, bigint, numeric, and float-family dataTypes to their canonical types", async () => {
    const model = await extractFixture("type-mapping");
    const users = model.entities.find((e) => e.name === "users")!;
    const byName = Object.fromEntries(users.fields.map((f) => [f.name, f]));

    expect(byName.settings.type).toBe("json");
    expect(byName.preferences.type).toBe("json");
    expect(byName.external_id.type).toBe("bigint");
    expect(byName.balance.type).toBe("decimal");
    expect(byName.score.type).toBe("float");
    expect(byName.rating.type).toBe("float");
  });

  it("falls back to 'unknown' for a dataType with no canonical mapping (e.g. a customType)", async () => {
    const model = await extractFixture("type-mapping");
    const users = model.entities.find((e) => e.name === "users")!;
    expect(users.fields.find((f) => f.name === "embedding")?.type).toBe(
      "unknown",
    );
  });

  it("resolves a Date-instance default to an ISO string", async () => {
    const model = await extractFixture("type-mapping");
    const users = model.entities.find((e) => e.name === "users")!;
    expect(
      users.fields.find((f) => f.name === "activated_at")?.defaultValue,
    ).toBe("2024-01-01T00:00:00.000Z");
  });

  it("JSON-stringifies a plain-object default", async () => {
    const model = await extractFixture("type-mapping");
    const users = model.entities.find((e) => e.name === "users")!;
    expect(users.fields.find((f) => f.name === "profile")?.defaultValue).toBe(
      '{"theme":"dark"}',
    );
  });

  it("marks a table-level single-column unique() the same as a column-level .unique()", async () => {
    const model = await extractFixture("type-mapping");
    const users = model.entities.find((e) => e.name === "users")!;
    expect(users.fields.find((f) => f.name === "email")?.isUnique).toBe(true);
    // Single-column — must not also appear as a composite unique group.
    expect(users.uniques).toBeUndefined();
  });
});

describe("drizzleAdapter.extract — physical table/column names (#3a)", () => {
  // Drizzle has no separate ORM-level model name the way Sequelize/Prisma/
  // TypeORM do — `entity.name`/`field.name` are already the physical SQL
  // table/column name (e.g. "post_tags"/"post_id" above), so tableName/
  // columnName would always equal `name` and stay unset.
  it("leaves tableName/columnName unset since name is already the physical name", async () => {
    const model = await extractFixture("postgres-basic");
    const posts = model.entities.find((e) => e.name === "posts")!;
    expect(posts.tableName).toBeUndefined();
    expect(posts.fields.find((f) => f.name === "author_id")?.columnName).toBe(
      undefined,
    );
  });
});

describe("drizzleAdapter.extract — singlestore dialect", () => {
  // SingleStore (a distributed DB) has no FK constraint concept at all, so
  // `getTableConfig()` omits `foreignKeys` entirely rather than returning an
  // empty array — every reader has to tolerate that being `undefined`. Found
  // by hand-testing a real SingleStore schema, which crashed with
  // "tableConfig.foreignKeys is not iterable" before this was fixed.
  it("extracts a table with no foreign keys without crashing", async () => {
    const model = await extractFixture("singlestore-basic");
    expect(model.entities.map((e) => e.name)).toEqual(["tags"]);
    expect(model.relations).toEqual([]);
    const name = model.entities[0].fields.find((f) => f.name === "name")!;
    expect(name.isUnique).toBe(true);
  });
});

describe("drizzleAdapter.extract — sqlite dialect", () => {
  it("extracts entities and a 1-n relation the same way as postgres", async () => {
    const model = await extractFixture("sqlite-basic");
    expect(model.entities.map((e) => e.name).toSorted()).toEqual([
      "posts",
      "users",
    ]);
    const rel = model.relations.find(
      (r) => r.from === "users" && r.to === "posts",
    )!;
    expect(rel.type).toBe("1-n");
    expect(rel.toColumn).toBe("author_id");
  });

  it("maps a blob(mode: 'buffer') column to canonical bytes", async () => {
    const model = await extractFixture("sqlite-basic");
    const users = model.entities.find((e) => e.name === "users")!;
    expect(users.fields.find((f) => f.name === "avatar")?.type).toBe("bytes");
  });
});

describe("drizzleAdapter.extract — turso dialect", () => {
  // Turso is SQLite-compatible and authored with the same `sqliteTable` —
  // this only exercises that "turso" actually resolves to sqlite-core in
  // DIALECT_MODULES (a config typo/regression there is otherwise
  // untested), not any turso-specific behavior.
  it("extracts entities and a 1-n relation via the shared sqlite-core path", async () => {
    const model = await extractFixture("turso");
    expect(model.entities.map((e) => e.name).toSorted()).toEqual([
      "comments",
      "posts",
    ]);
    const rel = model.relations.find(
      (r) => r.from === "posts" && r.to === "comments",
    )!;
    expect(rel.type).toBe("1-n");
    expect(rel.toColumn).toBe("post_id");
  });
});

describe("drizzleAdapter.extract — mysql dialect", () => {
  it("extracts entities and a 1-n relation the same way as postgres", async () => {
    const model = await extractFixture("mysql-basic");
    expect(model.entities.map((e) => e.name).toSorted()).toEqual([
      "posts",
      "users",
    ]);
    const rel = model.relations.find(
      (r) => r.from === "users" && r.to === "posts",
    )!;
    expect(rel.type).toBe("1-n");
    expect(rel.toColumn).toBe("author_id");
  });

  // MySQL enums are inline/anonymous — `getSQLType()` returns the full
  // definition (e.g. "enum('admin','member')") rather than a stable name,
  // unlike Postgres's named `pgEnum()` type. Using that raw string as the
  // DBML emitter's Enum-block key would collide every enum column in the
  // schema into one block, so it must be synthesized per table+column
  // instead — this was an actual bug caught by hand-testing a real MySQL
  // schema outside the fixture suite before this test existed.
  it("synthesizes a distinct nativeType per enum column instead of the raw inline definition", async () => {
    const model = await extractFixture("mysql-basic");
    const users = model.entities.find((e) => e.name === "users")!;
    const posts = model.entities.find((e) => e.name === "posts")!;
    const role = users.fields.find((f) => f.name === "role")!;
    const status = posts.fields.find((f) => f.name === "status")!;

    expect(role.type).toBe("enum");
    expect(status.type).toBe("enum");
    expect(role.nativeType).not.toContain("(");
    expect(status.nativeType).not.toContain("(");
    expect(role.nativeType).not.toBe(status.nativeType);
  });
});

describe("drizzleAdapter.extract — casing strategy", () => {
  it("converts camelCase JS keys to snake_case DB names for un-named columns", async () => {
    const model = await extractFixture("casing");
    const comments = model.entities.find((e) => e.name === "comments")!;
    expect(comments.fields.map((f) => f.name).toSorted()).toEqual(
      ["id", "comment_body", "post_id"].toSorted(),
    );
  });

  it("resolves the FK column name through the same casing strategy", async () => {
    const model = await extractFixture("casing");
    const rel = model.relations.find(
      (r) => r.from === "posts" && r.to === "comments",
    )!;
    expect(rel.toColumn).toBe("post_id");
  });
});

describe("drizzleAdapter.extract — multi-file schema glob", () => {
  it("merges tables exported across every glob-matched file and resolves cross-file FKs", async () => {
    const model = await extractFixture("multi-file-schema");
    expect(model.entities.map((e) => e.name).toSorted()).toEqual([
      "posts",
      "users",
    ]);
    const rel = model.relations.find(
      (r) => r.from === "users" && r.to === "posts",
    )!;
    expect(rel.toColumn).toBe("author_id");
  });
});

describe("drizzleAdapter.extract — error cases", () => {
  it("throws a clear error when the config has no schema field", async () => {
    await expect(extractFixture("no-schema-field")).rejects.toThrow(
      /has no "schema" field/,
    );
  });

  it("throws a clear error for an unsupported dialect", async () => {
    await expect(extractFixture("unsupported-dialect")).rejects.toThrow(
      /isn't supported yet/,
    );
  });

  it("throws a clear error when the config file has no dialect field", async () => {
    // Needs its own package.json — without one anywhere up the tree, tsx
    // can't tell the file is ESM and double-wraps its default export,
    // which would make this fail for the wrong reason.
    const cwd = mkdtempSync(join(tmpdir(), "orm2erd-drizzle-no-dialect-"));
    writeFileSync(join(cwd, "package.json"), '{"type":"module"}');
    writeFileSync(
      join(cwd, "drizzle.config.ts"),
      "export default { schema: './schema.ts' };\n",
    );
    await expect(extractFixture(cwd)).rejects.toThrow(
      /doesn't export a valid drizzle-kit config/,
    );
  });

  it("throws a clear error when no schema files match the glob", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "orm2erd-drizzle-no-match-"));
    writeFileSync(join(cwd, "package.json"), '{"type":"module"}');
    writeFileSync(
      join(cwd, "drizzle.config.ts"),
      'export default { dialect: "postgresql", schema: "./nope/*.ts" };\n',
    );
    await expect(extractFixture(cwd)).rejects.toThrow(/No schema files found/);
  });

  it("throws a clear error when no tables are exported", async () => {
    // Needs to live under test/fixtures (not a bare mkdtemp dir) so
    // requireFromTarget can actually resolve "drizzle-orm" via the
    // project's own node_modules, same as every other extract() step.
    await expect(extractFixture("no-tables-exported")).rejects.toThrow(
      /No postgresql tables were exported/,
    );
  });

  it("throws a clear error when \"drizzle-orm\" can't be resolved from the config file's location", async () => {
    // The config lives in a bare temp dir with no node_modules chain to a
    // real drizzle-orm — but its schema field points (by absolute path) at
    // a real committed fixture schema, which imports drizzle-orm/pg-core
    // fine via its OWN location. So schema loading succeeds; it's
    // requireFromTarget's own later resolution (using the config file's
    // location, not the schema's) that must fail.
    const cwd = mkdtempSync(join(tmpdir(), "orm2erd-drizzle-unresolvable-"));
    writeFileSync(join(cwd, "package.json"), '{"type":"module"}');
    const realSchema = join(fixturesDir, "postgres-basic", "schema.ts");
    writeFileSync(
      join(cwd, "drizzle.config.ts"),
      `export default { dialect: "postgresql", schema: ${JSON.stringify(realSchema)} };\n`,
    );
    await expect(extractFixture(cwd)).rejects.toThrow(
      /Could not resolve "drizzle-orm" from/,
    );
  });

  it("throws a clear error when the resolved dialect module doesn't export the expected Table/Dialect classes", async () => {
    // A fake "drizzle-orm" resolvable from the config file's location, but
    // missing PgTable/PgDialect from its pg-core subpath entirely (as if
    // targeting an unsupported drizzle-orm version).
    const cwd = mkdtempSync(join(tmpdir(), "orm2erd-drizzle-wrong-shape-"));
    writeFileSync(join(cwd, "package.json"), '{"type":"module"}');
    const realSchema = join(fixturesDir, "postgres-basic", "schema.ts");
    writeFileSync(
      join(cwd, "drizzle.config.ts"),
      `export default { dialect: "postgresql", schema: ${JSON.stringify(realSchema)} };\n`,
    );

    const fakeOrmDir = join(cwd, "node_modules", "drizzle-orm");
    mkdirSync(fakeOrmDir, { recursive: true });
    writeFileSync(
      join(fakeOrmDir, "package.json"),
      JSON.stringify({
        name: "drizzle-orm",
        type: "commonjs",
        main: "index.js",
      }),
    );
    writeFileSync(join(fakeOrmDir, "index.js"), "module.exports = {};\n");
    writeFileSync(join(fakeOrmDir, "casing.js"), "module.exports = {};\n");
    writeFileSync(join(fakeOrmDir, "pg-core.js"), "module.exports = {};\n");

    await expect(extractFixture(cwd)).rejects.toThrow(
      /Could not find "PgTable"\/"PgDialect" exported from "drizzle-orm\/pg-core"/,
    );
  });
});

describe("drizzleAdapter.extract — schema resolution", () => {
  it("loads a .json drizzle-kit config file", async () => {
    const model = await extractFixture("json-config", "drizzle.config.json");
    expect(model.entities.map((e) => e.name)).toEqual(["users"]);
  });

  it("expands a directory schema field to its immediate importable files, ignoring non-source files", async () => {
    const model = await extractFixture("directory-schema");
    expect(model.entities.map((e) => e.name).toSorted()).toEqual([
      "posts",
      "users",
    ]);
  });

  it("skips a glob match that doesn't actually exist (e.g. a broken symlink)", async () => {
    // Lives under fixturesDir (not the OS tmpdir) so the real schema file's
    // own drizzle-orm/pg-core import resolves via the project's node_modules.
    const cwd = mkdtempSync(join(fixturesDir, ".broken-symlink-test-"));
    try {
      writeFileSync(join(cwd, "package.json"), '{"type":"module"}');
      writeFileSync(
        join(cwd, "users.ts"),
        [
          'import { pgTable, serial, text } from "drizzle-orm/pg-core";',
          "",
          'export const users = pgTable("users", {',
          '  id: serial("id").primaryKey(),',
          '  name: text("name").notNull(),',
          "});",
          "",
        ].join("\n"),
      );
      symlinkSync(join(cwd, "does-not-exist.ts"), join(cwd, "ghost.ts"));
      writeFileSync(
        join(cwd, "drizzle.config.ts"),
        'export default { dialect: "postgresql", schema: "./*.ts" };\n',
      );

      const model = await extractFixture(cwd);
      expect(model.entities.map((e) => e.name)).toEqual(["users"]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
