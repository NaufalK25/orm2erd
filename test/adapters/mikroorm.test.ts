import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mikroormAdapter } from "../../src/adapters/mikroorm";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/mikroorm/adapter",
);

// `dir` is either a fixturesDir-relative name ("basic") or an absolute path.
async function extractFixture(dir: string, filename: string) {
  const cwd = isAbsolute(dir) ? dir : join(fixturesDir, dir);
  const entry = await mikroormAdapter.resolveEntry(filename, cwd);
  return mikroormAdapter.extract(entry);
}

describe("mikroormAdapter.resolveEntry", () => {
  it("resolves a relative path against cwd into an absolute path", async () => {
    const entry = await mikroormAdapter.resolveEntry(
      "mikro-orm.config.ts",
      join(fixturesDir, "basic"),
    );
    expect(entry.path).toBe(join(fixturesDir, "basic", "mikro-orm.config.ts"));
  });

  it("throws when the path is a directory, not a file", async () => {
    await expect(
      mikroormAdapter.resolveEntry(".", join(fixturesDir, "basic")),
    ).rejects.toThrow(/is not a file/);
  });
});

describe("mikroormAdapter.extract — entities/entitiesTs folder discovery (classic decorators)", () => {
  it("discovers every entity across the entitiesTs directory", async () => {
    const model = await extractFixture("basic", "mikro-orm.config.ts");
    expect(model.entities.map((e) => e.name).toSorted()).toEqual([
      "Post",
      "Tag",
      "User",
    ]);
  });

  it("maps scalar field types, including implicit (reflection-inferred) types", async () => {
    const model = await extractFixture("basic", "mikro-orm.config.ts");
    const user = model.entities.find((e) => e.name === "User")!;

    expect(user.fields.find((f) => f.name === "id")).toMatchObject({
      type: "int",
      isPrimaryKey: true,
      isNullable: false,
    });
    expect(user.fields.find((f) => f.name === "email")).toMatchObject({
      type: "string",
      isUnique: true,
    });
    expect(user.fields.find((f) => f.name === "isActive")).toMatchObject({
      type: "boolean",
      columnName: "is_active",
      defaultValue: "true",
    });
  });

  it("sets entity.tableName and field.columnName only when they differ from the property name", async () => {
    const model = await extractFixture("basic", "mikro-orm.config.ts");
    const post = model.entities.find((e) => e.name === "Post")!;

    expect(post.tableName).toBe("posts");
    expect(post.fields.find((f) => f.name === "title")?.columnName).toBe(
      "post_title",
    );
    expect(
      post.fields.find((f) => f.name === "id")?.columnName,
    ).toBeUndefined();
  });

  it("carries entity-level comment as description", async () => {
    const model = await extractFixture("basic", "mikro-orm.config.ts");
    const user = model.entities.find((e) => e.name === "User")!;
    expect(user.description).toBe("App users");
  });

  it("carries a plain (non-unique) @Index() as an entity index", async () => {
    const model = await extractFixture("basic", "mikro-orm.config.ts");
    const post = model.entities.find((e) => e.name === "Post")!;
    expect(post.indexes).toEqual([{ fields: ["title"], name: undefined }]);
  });

  it("synthesizes a FK field for an owning @ManyToOne, typed off the referenced PK", async () => {
    const model = await extractFixture("basic", "mikro-orm.config.ts");
    const post = model.entities.find((e) => e.name === "Post")!;
    const fk = post.fields.find((f) => f.name === "author_id");
    expect(fk).toMatchObject({
      type: "int",
      isForeignKey: true,
      isNullable: false,
    });
  });

  it("doesn't synthesize a field for an owning @ManyToMany (no physical column on this table)", async () => {
    const model = await extractFixture("basic", "mikro-orm.config.ts");
    const post = model.entities.find((e) => e.name === "Post")!;
    expect(post.fields.map((f) => f.name)).not.toContain("tags");
  });

  it("filters out MikroORM's own synthesized implicit m:n pivot-table entity", async () => {
    const model = await extractFixture("basic", "mikro-orm.config.ts");
    expect(model.entities.map((e) => e.name)).not.toContain("posts_tags");
  });

  it("emits a single 1-n relation with onDelete/onUpdate from the owning @ManyToOne side", async () => {
    const model = await extractFixture("basic", "mikro-orm.config.ts");
    const userToPost = model.relations.find((r) => r.type === "1-n")!;
    expect(userToPost).toMatchObject({
      from: "User",
      to: "Post",
      fieldName: "posts",
      fromColumn: "id",
      toColumn: "author_id",
      isFromOptional: false,
      onDelete: "cascade",
      onUpdate: "cascade",
    });
  });

  it("collapses an owning @ManyToMany pair into a single n-n relation with no FK columns", async () => {
    const model = await extractFixture("basic", "mikro-orm.config.ts");
    const nnRelations = model.relations.filter((r) => r.type === "n-n");
    expect(nnRelations).toHaveLength(1);
    expect(nnRelations[0]).toMatchObject({
      from: "Post",
      to: "Tag",
      fieldName: "tags",
    });
    expect(nnRelations[0].fromColumn).toBeUndefined();
    expect(nnRelations[0].toColumn).toBeUndefined();
  });

  it("emits a standalone 1-n for a @ManyToOne with no matching @OneToMany back-reference", async () => {
    const model = await extractFixture("basic", "mikro-orm.config.ts");
    const unpaired = model.relations.find(
      (r) => r.type === "1-n" && r.from === "User" && r.to === "Tag",
    );
    expect(unpaired).toBeDefined();
  });

  it("produces exactly one relation per real relationship, not one per declared side", async () => {
    const model = await extractFixture("basic", "mikro-orm.config.ts");
    // User<->Post (1-n via author), Post<->Tag (n-n), and the standalone
    // Tag.createdBy (1-n, unpaired) — three real relationships from what
    // MikroORM records as more EntityProperty sides.
    expect(model.relations).toHaveLength(3);
  });
});

describe("mikroormAdapter.extract — composite keys", () => {
  it("carries a composite PK, keeping the per-field isPrimaryKey marker too", async () => {
    const model = await extractFixture("composite", "mikro-orm.config.ts");
    const postTag = model.entities.find((e) => e.name === "PostTag")!;
    expect(postTag.primaryKey).toEqual(["postId", "tagId"]);
    expect(postTag.fields.find((f) => f.name === "postId")?.isPrimaryKey).toBe(
      true,
    );
  });

  it("carries a multi-column entity-level @Unique() as Entity.uniques", async () => {
    const model = await extractFixture("composite", "mikro-orm.config.ts");
    const postTag = model.entities.find((e) => e.name === "PostTag")!;
    expect(postTag.uniques).toEqual([["tagId", "addedBy"]]);
  });

  it("keeps a single-column entity-level @Unique() on the field, not Entity.uniques", async () => {
    const model = await extractFixture("composite", "mikro-orm.config.ts");
    const postTag = model.entities.find((e) => e.name === "PostTag")!;
    expect(postTag.fields.find((f) => f.name === "slug")?.isUnique).toBe(true);
  });
});

describe("mikroormAdapter.extract — @Embedded", () => {
  it("flattens an inline embeddable into its own prefixed columns, with no field for the wrapper itself", async () => {
    const model = await extractFixture("embedded", "mikro-orm.config.ts");
    const user = model.entities.find((e) => e.name === "User")!;

    expect(user.fields.find((f) => f.name === "homeAddress")).toBeUndefined();
    expect(
      user.fields.find((f) => f.name === "home_address_street"),
    ).toMatchObject({ type: "string" });
    expect(
      user.fields.find((f) => f.name === "home_address_city"),
    ).toMatchObject({ type: "string" });
  });

  it("keeps an `{ object: true }` embeddable as a single json field, dropping its virtual per-field mirrors", async () => {
    const model = await extractFixture("embedded", "mikro-orm.config.ts");
    const user = model.entities.find((e) => e.name === "User")!;

    expect(user.fields.find((f) => f.name === "workAddress")).toMatchObject({
      type: "json",
      columnName: "work_address",
    });
    expect(
      user.fields.find((f) => f.name === "work_address~street"),
    ).toBeUndefined();
    expect(
      user.fields.find((f) => f.name === "work_address~city"),
    ).toBeUndefined();
  });

  it("emits no relation for either embedding mode", async () => {
    const model = await extractFixture("embedded", "mikro-orm.config.ts");
    expect(model.relations).toEqual([]);
  });
});

describe("mikroormAdapter.extract — already-initialized instance export", () => {
  it("awaits and reads metadata from a bootstrap file that calls MikroORM.init() itself", async () => {
    // This path never runs its entities through orm2erd's own tsc-compile
    // step (case 1's fix for decorator support) — it directly imports
    // whatever the bootstrap file itself imports, so tsx's own tsconfig
    // auto-detection (which resolves relative to `process.cwd()`, not the
    // entry file's location) has to actually find this fixture's
    // `tsconfig.json`. Real CLI usage is always invoked with `cwd` at or
    // below the target project root, so this holds in practice — chdir here
    // to match that instead of orm2erd's own repo root (vitest's cwd).
    const originalCwd = process.cwd();
    process.chdir(join(fixturesDir, "instance-export"));
    let model: Awaited<ReturnType<typeof extractFixture>>;
    try {
      model = await extractFixture("instance-export", "mikro-orm-bootstrap.ts");
    } finally {
      process.chdir(originalCwd);
    }
    expect(model.entities.map((e) => e.name)).toEqual(["User"]);
  });
});

// Extraction resolves "@mikro-orm/core" from the entry file's location
// before it ever reaches `runTargetTsc` (needed just to set
// `Utils.dynamicImportProvider`), so the tsconfig/typescript error-case
// tests below need a fake stub package to get past that — same "fake
// node_modules" approach the TypeORM adapter's own tests use for its
// "missing internals" cases.
function writeFakeMikroOrmCore(cwd: string) {
  const pkgDir = join(cwd, "node_modules", "@mikro-orm", "core");
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(
    join(pkgDir, "package.json"),
    JSON.stringify({
      name: "@mikro-orm/core",
      type: "commonjs",
      main: "index.js",
    }),
  );
  writeFileSync(
    join(pkgDir, "index.js"),
    "class Utils {}\nUtils.dynamicImportProvider = (id) => import(id);\nmodule.exports = { Utils, MikroORM: class {} };\n",
  );
}

describe("mikroormAdapter.extract — error cases", () => {
  it("throws a clear error when the entry doesn't export a config or instance", async () => {
    await expect(
      extractFixture("no-config-export", "mikro-orm.config.ts"),
    ).rejects.toThrow(/doesn't export a MikroORM config or instance/);
  });

  // MikroORM's own `MetadataError.noEntityDiscovered()` fires here (not a
  // check of orm2erd's own) — this just verifies it propagates cleanly
  // through the adapter. Spawns a real `tsc` process (an empty `entitiesTs`
  // dir still triggers the compile step), which is close enough to the
  // default 5s budget to flake under a loaded test run — same reasoning as
  // any other test here that exercises `runTargetTsc`, just closer to the
  // edge since there's no other work to amortize the spawn cost against.
  it("propagates MikroORM's own error when no entities are discovered", async () => {
    await expect(
      extractFixture("no-entities", "mikro-orm.config.ts"),
    ).rejects.toThrow(/No entities were discovered/);
  }, 15_000);

  it("throws a clear error when no tsconfig.json can be found for an entitiesTs directory", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "orm2erd-mikroorm-no-tsconfig-"));
    writeFakeMikroOrmCore(cwd);
    mkdirSync(join(cwd, "entities"));
    writeFileSync(
      join(cwd, "mikro-orm.config.ts"),
      'export default { entitiesTs: ["./entities"], entities: [], dbName: ":memory:", driver: class {} };\n',
    );
    await expect(extractFixture(cwd, "mikro-orm.config.ts")).rejects.toThrow(
      /Could not find a tsconfig\.json/,
    );
  });

  it('throws a clear error when "typescript" can\'t be resolved from the entitiesTs directory', async () => {
    // A tsconfig.json is found (so findNearestTsconfig succeeds), but this
    // dir lives outside any node_modules chain reaching a real "typescript"
    // — unlike every other .ts-entry test, which run from inside this
    // project's own tree and so always find *our* typescript.
    const cwd = mkdtempSync(join(tmpdir(), "orm2erd-mikroorm-no-typescript-"));
    writeFakeMikroOrmCore(cwd);
    mkdirSync(join(cwd, "entities"));
    writeFileSync(join(cwd, "tsconfig.json"), "{}");
    writeFileSync(
      join(cwd, "mikro-orm.config.ts"),
      'export default { entitiesTs: ["./entities"], entities: [], dbName: ":memory:", driver: class {} };\n',
    );
    await expect(extractFixture(cwd, "mikro-orm.config.ts")).rejects.toThrow(
      /Could not resolve "typescript" from/,
    );
  });
});

describe("mikroormAdapter.extract — compiled entities, no entitiesTs", () => {
  it("passes already-compiled entities straight through without a tsc build", async () => {
    const model = await extractFixture("compiled-only", "mikro-orm.config.ts");
    expect(model.entities.map((e) => e.name)).toEqual(["User"]);
  });
});

describe("mikroormAdapter.extract — unrecognized custom type", () => {
  it("falls back to the runtimeType tier when neither the declared type nor the driver SQL type is recognized", async () => {
    // `WeirdType` (see the fixture) only overrides the *storage* SQL type —
    // MikroORM still reflects `weird!: string`'s real TS type as the
    // `runtimeType` fallback, so this lands on "string" via that third tier
    // rather than the declared-type/columnTypes tiers above it.
    const model = await extractFixture("custom-type", "mikro-orm.config.ts");
    const user = model.entities.find((e) => e.name === "User")!;
    expect(user.fields.find((f) => f.name === "weird")?.type).toBe("string");
  });
});
