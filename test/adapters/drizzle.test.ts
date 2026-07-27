import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
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
  });

  it("builds a 1-1 relation when the FK column is also unique", async () => {
    const model = await extractFixture("postgres-basic");
    const userToProfile = model.relations.filter(
      (r) => r.type === "1-1" && r.from === "users" && r.to === "profiles",
    );
    expect(userToProfile).toHaveLength(1);
    expect(userToProfile[0].onDelete).toBe("cascade");
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
    const memberships = model.entities.find((e) => e.name === "memberships")!;

    expect(memberships.primaryKey?.toSorted()).toEqual(
      ["user_id", "org_id"].toSorted(),
    );
    expect(memberships.uniques).toEqual([["org_id", "role"]]);
    expect(
      memberships.fields.find((f) => f.name === "user_id")?.isPrimaryKey,
    ).toBe(true);
    expect(memberships.fields.find((f) => f.name === "slug")?.isUnique).toBe(
      true,
    );
  });

  it("carries a non-unique index() declaration as a plain index", async () => {
    const model = await extractFixture("composite");
    const memberships = model.entities.find((e) => e.name === "memberships")!;
    expect(memberships.indexes).toEqual([
      { fields: ["role"], name: "role_idx" },
    ]);
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
    expect(model.entities.map((e) => e.name)).toEqual(["widgets"]);
    expect(model.relations).toEqual([]);
    const name = model.entities[0].fields.find((f) => f.name === "name")!;
    expect(name.isUnique).toBe(true);
  });
});

describe("drizzleAdapter.extract — sqlite dialect", () => {
  it("extracts entities and a 1-n relation the same way as postgres", async () => {
    const model = await extractFixture("sqlite-basic");
    expect(model.entities.map((e) => e.name).toSorted()).toEqual([
      "authors",
      "books",
    ]);
    const rel = model.relations.find(
      (r) => r.from === "authors" && r.to === "books",
    )!;
    expect(rel.type).toBe("1-n");
    expect(rel.toColumn).toBe("author_id");
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
      "notes",
      "tags",
    ]);
    const rel = model.relations.find(
      (r) => r.from === "notes" && r.to === "tags",
    )!;
    expect(rel.type).toBe("1-n");
    expect(rel.toColumn).toBe("note_id");
  });
});

describe("drizzleAdapter.extract — mysql dialect", () => {
  it("extracts entities and a 1-n relation the same way as postgres", async () => {
    const model = await extractFixture("mysql-basic");
    expect(model.entities.map((e) => e.name).toSorted()).toEqual([
      "accounts",
      "users",
    ]);
    const rel = model.relations.find(
      (r) => r.from === "users" && r.to === "accounts",
    )!;
    expect(rel.type).toBe("1-n");
    expect(rel.toColumn).toBe("user_id");
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
    const accounts = model.entities.find((e) => e.name === "accounts")!;
    const role = users.fields.find((f) => f.name === "role")!;
    const status = accounts.fields.find((f) => f.name === "status")!;

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
    const teamMembers = model.entities.find((e) => e.name === "team_members")!;
    expect(teamMembers.fields.map((f) => f.name).toSorted()).toEqual(
      ["id", "full_name", "team_id"].toSorted(),
    );
  });

  it("resolves the FK column name through the same casing strategy", async () => {
    const model = await extractFixture("casing");
    const rel = model.relations.find(
      (r) => r.from === "teams" && r.to === "team_members",
    )!;
    expect(rel.toColumn).toBe("team_id");
  });
});

describe("drizzleAdapter.extract — multi-file schema glob", () => {
  it("merges tables exported across every glob-matched file and resolves cross-file FKs", async () => {
    const model = await extractFixture("multi-file-schema");
    expect(model.entities.map((e) => e.name).toSorted()).toEqual([
      "authors",
      "posts",
    ]);
    const rel = model.relations.find(
      (r) => r.from === "authors" && r.to === "posts",
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
});
