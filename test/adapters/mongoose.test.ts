import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  vi,
  type MockInstance,
} from "vitest";
import { mkdtempSync } from "node:fs";
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
    expect(model.entities.map((e) => e.name)).toEqual(["Widget"]);
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
    expect(status.nativeType).toBe("enum_Widget_status");
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
});

describe("mongooseAdapter.extract — relations", () => {
  let model: ERDModel;

  beforeAll(async () => {
    mongoose.deleteModel(/.*/);
    model = await extractFixture("relations.ts");
  });

  it("collapses a reciprocal array+singular pair into one 1-n relation", () => {
    const rel = model.relations.filter(
      (r) => r.from === "Author" && r.to === "Post",
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

  it("treats a standalone unique singular ref as 1-1, declaring model as 'from'", () => {
    const rel = model.relations.find(
      (r) => r.from === "Account" && r.to === "Person",
    );
    expect(rel).toMatchObject({
      type: "1-1",
      fieldName: "owner",
      fromColumn: "owner",
      toColumn: "_id",
    });
  });

  it("treats a standalone non-unique singular ref as 1-n, ref'd model as 'from'", () => {
    const rel = model.relations.find(
      (r) => r.from === "Person" && r.to === "Comment",
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
      (r) => r.from === "Team" && r.to === "Person",
    );
    expect(rel).toMatchObject({ type: "1-n", fieldName: "members" });
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

  it("produces exactly one relation per real relationship, not one per side", () => {
    expect(model.relations).toHaveLength(8);
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
    const membership = model.entities.find((e) => e.name === "Membership")!;

    expect(membership.uniques).toEqual([["orgId", "role"]]);
    // Mongoose has no composite primary key — _id is always the single PK.
    expect(membership.primaryKey).toBeUndefined();
    // The single-field `slug` unique stays on the field, not the group.
    expect(membership.fields.find((f) => f.name === "slug")?.isUnique).toBe(
      true,
    );
  });

  it("carries non-unique schema.index() declarations as plain indexes", async () => {
    const model = await extractFixture("composite-unique.ts");
    const membership = model.entities.find((e) => e.name === "Membership")!;

    expect(membership.indexes).toEqual([
      { fields: ["userId", "role"], name: "user_role_idx" },
      { fields: ["role"] },
    ]);
  });
});
