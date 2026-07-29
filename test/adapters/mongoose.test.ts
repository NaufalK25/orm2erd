import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  vi,
  type MockInstance,
} from "vitest";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { mongooseAdapter } from "../../src/adapters/mongoose";
import type { ERDModel } from "../../src/core/model";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/mongoose",
);

async function extractFixture(pathSegment: string): Promise<ERDModel> {
  const entry = await mongooseAdapter.resolveEntry(pathSegment, fixturesDir);
  return mongooseAdapter.extract(entry);
}

describe("mongooseAdapter.resolveEntry", () => {
  it("resolves a relative file path against cwd into an absolute path", async () => {
    const entry = await mongooseAdapter.resolveEntry("fields.ts", fixturesDir);
    expect(entry.path).toBe(join(fixturesDir, "fields.ts"));
  });

  it("resolves a relative directory path against cwd into an absolute path", async () => {
    const entry = await mongooseAdapter.resolveEntry(
      "directory-import",
      fixturesDir,
    );
    expect(entry.path).toBe(join(fixturesDir, "directory-import"));
  });

  it("throws a clear error for a path that doesn't exist", async () => {
    await expect(
      mongooseAdapter.resolveEntry("does-not-exist.ts", fixturesDir),
    ).rejects.toThrow(/Failed to load Mongoose entry/);
  });

  it("rejects a path that's neither a file nor a directory (e.g. a FIFO)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "orm2erd-mongoose-test-"));
    const fifoPath = join(dir, "not-a-file-or-dir");
    try {
      execFileSync("mkfifo", [fifoPath]);
    } catch {
      rmSync(dir, { recursive: true, force: true });
      return;
    }
    try {
      await expect(mongooseAdapter.resolveEntry(fifoPath, dir)).rejects.toThrow(
        /is neither a file nor a directory/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("mongooseAdapter.extract — target mongoose module resolution", () => {
  const dirs: string[] = [];

  function makeTmpDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "orm2erd-mongoose-resolve-"));
    dirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws a clear error when \"mongoose\" can't be resolved from the entry file's location", async () => {
    // A bare temp dir with no node_modules chain leading to a "mongoose"
    // package — createRequire(...).resolve("mongoose") must fail here.
    const dir = makeTmpDir();
    const entryFile = join(dir, "entry.ts");
    writeFileSync(entryFile, "export {};\n");

    const entry = await mongooseAdapter.resolveEntry(entryFile, dir);
    await expect(mongooseAdapter.extract(entry)).rejects.toThrow(
      /Could not resolve "mongoose" from/,
    );
  });

  it('throws a clear error when the resolved "mongoose" doesn\'t look like the real module', async () => {
    // A fake "mongoose" package resolvable from the entry file, but whose
    // shape doesn't match looksLikeMongooseModule (no .set()/.models).
    const dir = makeTmpDir();
    const fakeMongooseDir = join(dir, "node_modules", "mongoose");
    mkdirSync(fakeMongooseDir, { recursive: true });
    writeFileSync(
      join(fakeMongooseDir, "package.json"),
      JSON.stringify({ name: "mongoose", main: "index.js", type: "module" }),
    );
    writeFileSync(
      join(fakeMongooseDir, "index.js"),
      "export default { notMongoose: true };\n",
    );
    const entryFile = join(dir, "entry.ts");
    writeFileSync(entryFile, "export {};\n");

    const entry = await mongooseAdapter.resolveEntry(entryFile, dir);
    await expect(mongooseAdapter.extract(entry)).rejects.toThrow(
      /doesn't look like the mongoose module/,
    );
  });
});

// Each describe block below extracts its fixture exactly once in beforeAll,
// clearing mongoose's global model registry first. Re-importing the same
// fixture file a second time is a no-op (ESM module cache means its
// top-level mongoose.model() calls won't run again), and the registry is a
// process-wide singleton shared across every fixture — so tests within a
// describe read a shared result instead of each re-extracting.
describe("mongooseAdapter.extract — field mapping", () => {
  let model: ERDModel;

  beforeAll(async () => {
    mongoose.deleteModel(/.*/);
    model = await extractFixture("fields.ts");
  });

  it("registers exactly the one model defined in the fixture", () => {
    expect(model.entities.map((e) => e.name)).toEqual(["Product"]);
  });

  it("marks _id as the primary key, non-nullable, mapped to string", () => {
    const id = model.entities[0].fields.find((f) => f.name === "_id")!;
    expect(id.isPrimaryKey).toBe(true);
    expect(id.isNullable).toBe(false);
    expect(id.type).toBe("string");
    expect(id.nativeType).toBe("ObjectId");
  });

  it("filters out __v and Map's synthetic '.$*' subpath", () => {
    const fields = model.entities[0].fields;
    expect(fields.find((f) => f.name === "__v")).toBeUndefined();
    expect(fields.find((f) => f.name.endsWith(".$*"))).toBeUndefined();
  });

  it("maps required: true to isNullable: false", () => {
    const label = model.entities[0].fields.find((f) => f.name === "label")!;
    expect(label.isNullable).toBe(false);
  });

  it("maps Number/Decimal128/Buffer/Map/Mixed/Date to the right canonical types", () => {
    const byName = Object.fromEntries(
      model.entities[0].fields.map((f) => [f.name, f]),
    );
    expect(byName.weight.type).toBe("float");
    expect(byName.price.type).toBe("decimal");
    expect(byName.blob.type).toBe("bytes");
    expect(byName.attributes.type).toBe("json");
    expect(byName.anything.type).toBe("unknown");
    expect(byName.releasedAt.type).toBe("datetime");
  });

  it("captures enum values, the enum canonical type, and the default value", () => {
    const status = model.entities[0].fields.find((f) => f.name === "status")!;
    expect(status.type).toBe("enum");
    expect(status.enumValues).toEqual(["draft", "published"]);
    expect(status.defaultValue).toBe("draft");
    expect(status.nativeType).toBe("enum_Product_status");
  });

  it("appends () to a function-based default to signal it's computed, not literal", () => {
    const createdAt = model.entities[0].fields.find(
      (f) => f.name === "createdAt",
    )!;
    expect(createdAt.defaultValue).toBe("now()");
  });

  it("marks a unique field", () => {
    const sku = model.entities[0].fields.find((f) => f.name === "sku")!;
    expect(sku.isUnique).toBe(true);
  });

  it("marks an array field as isList with the element's canonical type", () => {
    const labels = model.entities[0].fields.find((f) => f.name === "labels")!;
    expect(labels.isList).toBe(true);
    expect(labels.type).toBe("string");
  });

  it("JSON-stringifies a plain-object default", () => {
    const metadata = model.entities[0].fields.find(
      (f) => f.name === "metadata",
    )!;
    expect(metadata.defaultValue).toBe('{"source":"import"}');
  });

  it("falls back to '(function)' for an anonymous function default", () => {
    const slug = model.entities[0].fields.find((f) => f.name === "slug")!;
    expect(slug.defaultValue).toBe("(function)()");
  });

  it("maps a custom SchemaType with no known instance mapping to 'unknown'", () => {
    const weird = model.entities[0].fields.find((f) => f.name === "weird")!;
    expect(weird.type).toBe("unknown");
    expect(weird.nativeType).toBe("CustomType");
  });
});

describe("mongooseAdapter.extract — relations", () => {
  let model: ERDModel;

  beforeAll(async () => {
    mongoose.deleteModel(/.*/);
    model = await extractFixture("relations.ts");
  });

  it("collapses a reciprocal array+singular pair into one 1-n relation", () => {
    const rel = model.relations.filter(
      (r) => r.from === "User" && r.to === "Post",
    );
    expect(rel).toHaveLength(1);
    expect(rel[0]).toMatchObject({
      type: "1-n",
      fieldName: "posts",
      fromColumn: "_id",
      toColumn: "author",
    });
  });

  it("collapses a reciprocal array pair on both sides into one n-n relation with no columns", () => {
    const rel = model.relations.filter(
      (r) =>
        r.type === "n-n" &&
        [r.from, r.to].toSorted().join(",") ===
          ["Post", "Tag"].toSorted().join(","),
    );
    expect(rel).toHaveLength(1);
    expect(rel[0].fromColumn).toBeUndefined();
    expect(rel[0].toColumn).toBeUndefined();
  });

  it("collapses a reciprocal unique-singular pair into one 1-1 relation", () => {
    const rel = model.relations.filter(
      (r) =>
        r.type === "1-1" &&
        [r.from, r.to].toSorted().join(",") ===
          ["Profile", "User"].toSorted().join(","),
    );
    expect(rel).toHaveLength(1);
  });

  it("treats a standalone unique singular ref as 1-1, referenced model as 'from'", () => {
    const rel = model.relations.find(
      (r) => r.from === "Customer" && r.to === "Product",
    );
    expect(rel).toMatchObject({
      type: "1-1",
      fieldName: "owner",
      fromColumn: "_id",
      toColumn: "owner",
      isFromOptional: true,
    });
  });

  it("treats a standalone non-unique singular ref as 1-n, ref'd model as 'from'", () => {
    const rel = model.relations.find(
      (r) => r.from === "User" && r.to === "Comment",
    );
    expect(rel).toMatchObject({
      type: "1-n",
      fieldName: "author",
      fromColumn: "_id",
      toColumn: "author",
    });
  });

  it("treats a standalone array-only ref as 1-n with no resolvable columns", () => {
    const rel = model.relations.find(
      (r) => r.from === "Order" && r.to === "Customer",
    );
    expect(rel).toMatchObject({ type: "1-n", fieldName: "customers" });
    expect(rel!.fromColumn).toBeUndefined();
    expect(rel!.toColumn).toBeUndefined();
  });

  it("doesn't merge two distinct refs between the same model pair", () => {
    const rels = model.relations.filter(
      (r) => r.from === "Warehouse" && r.to === "Order",
    );
    expect(rels).toHaveLength(2);
    expect(rels.map((r) => r.fieldName).toSorted()).toEqual([
      "destinationWarehouse",
      "originWarehouse",
    ]);
  });

  it("sets isFromOptional false for a standalone unique+required singular ref", () => {
    const rel = model.relations.find(
      (r) => r.from === "Customer" && r.to === "Transaction",
    );
    expect(rel).toMatchObject({
      type: "1-1",
      fieldName: "customer",
      isFromOptional: false,
    });
  });

  it("produces exactly one relation per real relationship, not one per side", () => {
    expect(model.relations).toHaveLength(9);
  });
});

describe("mongooseAdapter.extract — physical collection names (#3a)", () => {
  it("sets entity.tableName from an explicit `collection` schema option", async () => {
    mongoose.deleteModel(/.*/);
    const model = await extractFixture("names.ts");
    const archive = model.entities.find((e) => e.name === "CustomerArchive")!;
    expect(archive.tableName).toBe("tbl_customer");
  });

  it("still surfaces mongoose's default pluralised+lowercased collection name with no explicit override", async () => {
    mongoose.deleteModel(/.*/);
    const model = await extractFixture("fields.ts");
    const product = model.entities.find((e) => e.name === "Product")!;
    expect(product.tableName).toBe("products");
  });

  it("leaves tableName unset when the explicit collection name equals the model name", async () => {
    mongoose.deleteModel(/.*/);
    const model = await extractFixture("names.ts");
    const tag = model.entities.find((e) => e.name === "Tag")!;
    expect(tag.tableName).toBeUndefined();
  });
});

describe("mongooseAdapter.extract — directory import", () => {
  let model: ERDModel;
  let consoleLogSpy: MockInstance<typeof console.log>;

  beforeAll(async () => {
    mongoose.deleteModel(/.*/);
    consoleLogSpy = vi.spyOn(console, "log");
    model = await extractFixture("directory-import");
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
  });

  it("imports every model file in the directory, skipping one that throws", () => {
    // broken.ts throws on import; if that weren't caught, extractFixture()
    // above would have rejected instead of populating `model` at all.
    expect(model.entities.map((e) => e.name).toSorted()).toEqual([
      "DirPost",
      "DirUser",
    ]);
  });

  it("never imports a file with no mongoose signature, even if it's valid source in the directory", () => {
    // server.ts has no mongoose import/Schema/model call — it simulates an
    // unrelated app entry point. If the adapter imported it anyway (as it
    // once did, before content-filtering directory entries), its
    // console.log side effect would have fired.
    const leaked = consoleLogSpy.mock.calls.some((call) =>
      call.some(
        (arg) => typeof arg === "string" && arg.includes("Server running"),
      ),
    );
    expect(leaked).toBe(false);
  });
});

describe("mongooseAdapter.extract — directory scan exclusions & error tolerance", () => {
  const dirs: string[] = [];

  function makeTmpDir(): string {
    // Under fixturesDir (inside the project tree), not the OS tmpdir — the
    // adapter needs to resolve a real "mongoose" package from here via
    // node's normal upward node_modules search, same as any real project.
    const dir = mkdtempSync(join(fixturesDir, ".scan-test-"));
    dirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      chmodSync(dir, 0o700);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("skips node_modules/hidden dirs, .d.ts/test files, and oversized files, and tolerates unreadable entries", async () => {
    const dir = makeTmpDir();

    const goodContent = [
      'import mongoose from "mongoose";',
      "const ScanGoodSchema = new mongoose.Schema({ name: String });",
      'mongoose.model("ScanGood", ScanGoodSchema);',
      "",
    ].join("\n");
    // Every "trap" file below has a real mongoose signature and would
    // register its own model if the exclusion it's testing didn't hold —
    // so a leaked import shows up as an extra entity, not silently.
    const trapContent = [
      'import mongoose from "mongoose";',
      "const ScanTrapSchema = new mongoose.Schema({ name: String });",
      'mongoose.model("ScanTrap", ScanTrapSchema);',
      "",
    ].join("\n");

    writeFileSync(join(dir, "good.ts"), goodContent);
    writeFileSync(join(dir, "types.d.ts"), trapContent);
    writeFileSync(join(dir, "broken.test.ts"), trapContent);
    writeFileSync(
      join(dir, "huge.ts"),
      `// ${"x".repeat(1_000_010)}\n${trapContent}`,
    );

    mkdirSync(join(dir, "node_modules"));
    writeFileSync(join(dir, "node_modules", "trap.ts"), trapContent);

    mkdirSync(join(dir, ".hidden"));
    writeFileSync(join(dir, ".hidden", "trap.ts"), trapContent);

    const unreadableDir = join(dir, "unreadable-dir");
    mkdirSync(unreadableDir);
    writeFileSync(join(unreadableDir, "trap.ts"), trapContent);
    chmodSync(unreadableDir, 0o000);

    const secretFile = join(dir, "secret.ts");
    writeFileSync(secretFile, trapContent);
    chmodSync(secretFile, 0o000);

    // A symlink is neither isDirectory() nor isFile() (lstat semantics) —
    // must be skipped outright, not followed. Points nowhere, so there's no
    // real target file that would independently register its own model.
    symlinkSync(join(dir, "does-not-exist.ts"), join(dir, "link.ts"));

    mongoose.deleteModel(/.*/);
    try {
      const entry = await mongooseAdapter.resolveEntry(dir, dir);
      const model = await mongooseAdapter.extract(entry);
      expect(model.entities.map((e) => e.name)).toEqual(["ScanGood"]);
    } finally {
      chmodSync(unreadableDir, 0o700);
      chmodSync(secretFile, 0o644);
    }
  });
});

describe("mongooseAdapter.extract — no models found", () => {
  it("throws a clear error when a file registers no models", async () => {
    mongoose.deleteModel(/.*/);
    await expect(extractFixture("empty.ts")).rejects.toThrow(
      /No mongoose models were registered/,
    );
  });

  it("throws a clear error when a directory has no source files", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "orm2erd-mongoose-extract-"));
    const entry = await mongooseAdapter.resolveEntry(emptyDir, emptyDir);
    await expect(mongooseAdapter.extract(entry)).rejects.toThrow(
      /No \.ts\/\.js files found/,
    );
  });
});

describe("mongooseAdapter.extract — composite unique", () => {
  it("carries a compound unique index, ignoring single-field and non-unique indexes", async () => {
    const model = await extractFixture("composite-unique.ts");
    const postTag = model.entities.find((e) => e.name === "PostTag")!;

    expect(postTag.uniques).toEqual([["tagId", "addedBy"]]);
    // Mongoose has no composite primary key — _id is always the single PK.
    expect(postTag.primaryKey).toBeUndefined();
    // The single-field `slug` unique stays on the field, not the group.
    expect(postTag.fields.find((f) => f.name === "slug")?.isUnique).toBe(true);
  });

  it("carries non-unique schema.index() declarations as plain indexes", async () => {
    const model = await extractFixture("composite-unique.ts");
    const postTag = model.entities.find((e) => e.name === "PostTag")!;

    expect(postTag.indexes).toEqual([
      { fields: ["postId", "addedBy"], name: "post_addedby_idx" },
      { fields: ["addedBy"] },
    ]);
  });
});
