import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Entity, ERDModel, Field, Relation } from "../../src/core/model";
import type { ModelDiff } from "../../src/core/model-diff";
import {
  diffModel,
  formatModelDiff,
  isModelDiffEmpty,
  modelSnapshotPath,
  readModelSnapshot,
  writeModelSnapshot,
  MODEL_SNAPSHOT_VERSION,
} from "../../src/core/model-diff";

function field(name: string, overrides: Partial<Field> = {}): Field {
  return { name, type: "string", nativeType: "String", ...overrides };
}

function entity(
  name: string,
  fields: Field[],
  overrides: Partial<Entity> = {},
): Entity {
  return { name, fields, ...overrides };
}

function relation(
  from: string,
  to: string,
  type: Relation["type"],
  overrides: Partial<Relation> = {},
): Relation {
  return { from, to, type, ...overrides };
}

function model(entities: Entity[], relations: Relation[] = []): ERDModel {
  return { entities, relations };
}

describe("diffModel — entities", () => {
  it("reports an added entity", () => {
    const before = model([entity("User", [field("id")])]);
    const after = model([
      entity("User", [field("id")]),
      entity("Post", [field("id")]),
    ]);
    const diff = diffModel(before, after);
    expect(diff.entities).toEqual([
      {
        entity: "Post",
        status: "added",
        addedFields: ["id"],
        removedFields: [],
        changedFields: [],
      },
    ]);
  });

  it("reports a removed entity", () => {
    const before = model([
      entity("User", [field("id")]),
      entity("Post", [field("id")]),
    ]);
    const after = model([entity("User", [field("id")])]);
    const diff = diffModel(before, after);
    expect(diff.entities).toEqual([
      {
        entity: "Post",
        status: "removed",
        addedFields: [],
        removedFields: ["id"],
        changedFields: [],
      },
    ]);
  });

  it("reports an added field on an existing entity", () => {
    const before = model([entity("User", [field("id")])]);
    const after = model([entity("User", [field("id"), field("email")])]);
    const diff = diffModel(before, after);
    expect(diff.entities).toEqual([
      {
        entity: "User",
        status: "changed",
        tableNameChange: undefined,
        addedFields: ["email"],
        removedFields: [],
        changedFields: [],
      },
    ]);
  });

  it("reports a removed field on an existing entity", () => {
    const before = model([entity("User", [field("id"), field("email")])]);
    const after = model([entity("User", [field("id")])]);
    const diff = diffModel(before, after);
    expect(diff.entities).toEqual([
      {
        entity: "User",
        status: "changed",
        tableNameChange: undefined,
        addedFields: [],
        removedFields: ["email"],
        changedFields: [],
      },
    ]);
  });

  it("reports no diff for identical models", () => {
    const m = model([entity("User", [field("id")])]);
    expect(diffModel(m, m).entities).toEqual([]);
  });

  it("reports a table rename when only tableName changes", () => {
    const before = model([
      entity("User", [field("id")], { tableName: "users" }),
    ]);
    const after = model([
      entity("User", [field("id")], { tableName: "app_users" }),
    ]);
    const diff = diffModel(before, after);
    expect(diff.entities).toEqual([
      {
        entity: "User",
        status: "changed",
        tableNameChange: { before: "users", after: "app_users" },
        addedFields: [],
        removedFields: [],
        changedFields: [],
      },
    ]);
  });

  it("ignores a description-only field change", () => {
    const before = model([
      entity("User", [field("id", { description: "the primary key" })]),
    ]);
    const after = model([
      entity("User", [field("id", { description: "unique row id" })]),
    ]);
    expect(diffModel(before, after).entities).toEqual([]);
  });

  const fieldPropertyCases: [string, Partial<Field>, Partial<Field>][] = [
    ["type", { type: "string" }, { type: "int" }],
    ["nativeType", { nativeType: "String" }, { nativeType: "Int" }],
    ["columnName", {}, { columnName: "user_id" }],
    ["isNullable", { isNullable: false }, { isNullable: true }],
    ["isForeignKey", { isForeignKey: false }, { isForeignKey: true }],
    ["isPrimaryKey", { isPrimaryKey: false }, { isPrimaryKey: true }],
    ["isUnique", { isUnique: false }, { isUnique: true }],
    ["isList", { isList: false }, { isList: true }],
    ["defaultValue", {}, { defaultValue: "now()" }],
    ["enumValues", {}, { enumValues: ["a", "b"] }],
  ];

  it.each(fieldPropertyCases)(
    "reports a changed field when %s differs",
    (property, beforeOverrides, afterOverrides) => {
      const before = model([
        entity("User", [field("status", beforeOverrides)]),
      ]);
      const after = model([entity("User", [field("status", afterOverrides)])]);
      const diff = diffModel(before, after);
      expect(diff.entities).toHaveLength(1);
      expect(diff.entities[0].changedFields).toHaveLength(1);
      const change = diff.entities[0].changedFields[0];
      expect(change.field).toBe("status");
      expect(change.changes.map((c) => c.property)).toContain(property);
    },
  );
});

describe("diffModel — relations", () => {
  it("reports an added relation", () => {
    const before = model([], []);
    const after = model(
      [],
      [relation("User", "Post", "1-n", { fieldName: "posts" })],
    );
    expect(diffModel(before, after).relations).toEqual([
      { from: "User", to: "Post", fieldName: "posts", status: "added" },
    ]);
  });

  it("reports a removed relation", () => {
    const before = model(
      [],
      [relation("User", "Post", "1-n", { fieldName: "posts" })],
    );
    const after = model([], []);
    expect(diffModel(before, after).relations).toEqual([
      { from: "User", to: "Post", fieldName: "posts", status: "removed" },
    ]);
  });

  it("matches relations by FK column and reports a cardinality change", () => {
    const before = model(
      [],
      [
        relation("Post", "Tag", "1-n", {
          fieldName: "tags",
          fromColumn: "id",
          toColumn: "postId",
        }),
      ],
    );
    const after = model(
      [],
      [
        relation("Post", "Tag", "n-n", {
          fieldName: "tags",
          fromColumn: "id",
          toColumn: "postId",
        }),
      ],
    );
    const diff = diffModel(before, after);
    expect(diff.relations).toEqual([
      {
        from: "Post",
        to: "Tag",
        fieldName: "tags",
        status: "changed",
        changes: [{ property: "type", before: "1-n", after: "n-n" }],
      },
    ]);
  });

  it("distinguishes two relations between the same pair via fieldName", () => {
    const before = model(
      [],
      [
        relation("Post", "User", "1-n", {
          fieldName: "author",
          fromColumn: "authorId",
          toColumn: "id",
        }),
        relation("Post", "User", "1-n", {
          fieldName: "reviewer",
          fromColumn: "reviewerId",
          toColumn: "id",
        }),
      ],
    );
    const after = model(
      [],
      [
        relation("Post", "User", "1-n", {
          fieldName: "author",
          fromColumn: "authorId",
          toColumn: "id",
        }),
        relation("Post", "User", "n-n", {
          fieldName: "reviewer",
          fromColumn: "reviewerId",
          toColumn: "id",
        }),
      ],
    );
    const diff = diffModel(before, after);
    expect(diff.relations).toEqual([
      {
        from: "Post",
        to: "User",
        fieldName: "reviewer",
        status: "changed",
        changes: [{ property: "type", before: "1-n", after: "n-n" }],
      },
    ]);
  });

  it("matches via fieldName identity when FK columns are absent (implicit n-n)", () => {
    const before = model(
      [],
      [relation("Post", "Tag", "n-n", { fieldName: "tags" })],
    );
    const after = model(
      [],
      [
        relation("Post", "Tag", "n-n", {
          fieldName: "tags",
          onDelete: "cascade",
        }),
      ],
    );
    const diff = diffModel(before, after);
    expect(diff.relations).toEqual([
      {
        from: "Post",
        to: "Tag",
        fieldName: "tags",
        status: "changed",
        changes: [
          { property: "onDelete", before: undefined, after: "cascade" },
        ],
      },
    ]);
  });

  it("survives a fieldName rename when FK columns are unchanged", () => {
    const before = model(
      [],
      [
        relation("Post", "User", "1-n", {
          fieldName: "author",
          fromColumn: "authorId",
          toColumn: "id",
        }),
      ],
    );
    const after = model(
      [],
      [
        relation("Post", "User", "1-n", {
          fieldName: "writtenBy",
          fromColumn: "authorId",
          toColumn: "id",
        }),
      ],
    );
    // Matched via column identity, and fieldName isn't a tracked property —
    // so this is not reported as a change at all (not remove+add either).
    expect(diffModel(before, after).relations).toEqual([]);
  });

  it("pairs relations positionally when neither side has fieldName or columns", () => {
    const before = model(
      [],
      [
        relation("Post", "Tag", "n-n"),
        relation("Post", "Tag", "n-n", { onDelete: "cascade" }),
      ],
    );
    const after = model(
      [],
      [
        relation("Post", "Tag", "n-n"),
        relation("Post", "Tag", "n-n", { onDelete: "restrict" }),
      ],
    );
    const diff = diffModel(before, after);
    expect(diff.relations).toEqual([
      {
        from: "Post",
        to: "Tag",
        fieldName: undefined,
        status: "changed",
        changes: [
          { property: "onDelete", before: "cascade", after: "restrict" },
        ],
      },
    ]);
  });

  it("reports onUpdate and isFromOptional changes", () => {
    const before = model(
      [],
      [
        relation("Post", "User", "1-n", {
          fieldName: "author",
          onUpdate: "cascade",
          isFromOptional: false,
        }),
      ],
    );
    const after = model(
      [],
      [
        relation("Post", "User", "1-n", {
          fieldName: "author",
          onUpdate: "restrict",
          isFromOptional: true,
        }),
      ],
    );
    const diff = diffModel(before, after);
    expect(diff.relations).toEqual([
      {
        from: "Post",
        to: "User",
        fieldName: "author",
        status: "changed",
        changes: [
          { property: "onUpdate", before: "cascade", after: "restrict" },
          { property: "isFromOptional", before: false, after: true },
        ],
      },
    ]);
  });
});

describe("isModelDiffEmpty", () => {
  it("is true for identical models", () => {
    const m = model([entity("User", [field("id")])]);
    expect(isModelDiffEmpty(diffModel(m, m))).toBe(true);
  });

  it("is true when only a field description changed", () => {
    const before = model([entity("User", [field("id", { description: "a" })])]);
    const after = model([entity("User", [field("id", { description: "b" })])]);
    expect(isModelDiffEmpty(diffModel(before, after))).toBe(true);
  });

  it("is false when there's a real structural difference", () => {
    const before = model([entity("User", [field("id")])]);
    const after = model([entity("User", [field("id"), field("email")])]);
    expect(isModelDiffEmpty(diffModel(before, after))).toBe(false);
  });
});

describe("formatModelDiff", () => {
  it("renders an added column and a cardinality change matching the doc's examples", () => {
    const before = model(
      [entity("users", [field("id")])],
      [relation("posts", "tags", "1-n", { fieldName: "tags" })],
    );
    const after = model(
      [entity("users", [field("id"), field("last_login_at")])],
      [relation("posts", "tags", "n-n", { fieldName: "tags" })],
    );
    const lines = formatModelDiff(diffModel(before, after));
    expect(lines).toContain('users: +column "last_login_at"');
    expect(lines).toContain("posts → tags: cardinality changed (1-n → n-n)");
  });

  it("renders added/removed entities and removed columns", () => {
    const before = model([entity("User", [field("id"), field("legacyFlag")])]);
    const after = model([
      entity("User", [field("id")]),
      entity("Post", [field("id")]),
    ]);
    const lines = formatModelDiff(diffModel(before, after));
    expect(lines).toContain("Post: added (new entity)");
    expect(lines).toContain('User: -column "legacyFlag"');
  });

  // Hand-built ModelDiff (bypassing diffModel) so every formatModelDiff/
  // formatValue branch is exercised directly, not just the ones diffModel
  // happens to produce from the fixtures above: a removed entity, a
  // changed-field bullet (covering formatValue's undefined/array/string/
  // plain-value branches), a tableName rename where one side is undefined,
  // and added/removed/non-cardinality-changed relations.
  it("renders every entity/relation status and property-value shape", () => {
    const diff: ModelDiff = {
      entities: [
        {
          entity: "Post",
          status: "added",
          addedFields: ["id"],
          removedFields: [],
          changedFields: [],
        },
        {
          entity: "Comment",
          status: "removed",
          addedFields: [],
          removedFields: ["id"],
          changedFields: [],
        },
        {
          entity: "User",
          status: "changed",
          addedFields: [],
          removedFields: [],
          changedFields: [
            {
              field: "email",
              changes: [
                { property: "isNullable", before: false, after: true },
                {
                  property: "columnName",
                  before: undefined,
                  after: "user_email",
                },
                {
                  property: "enumValues",
                  before: undefined,
                  after: ["a", "b"],
                },
              ],
            },
          ],
        },
        {
          entity: "Order",
          status: "changed",
          tableNameChange: { before: undefined, after: "orders" },
          addedFields: [],
          removedFields: [],
          changedFields: [],
        },
        {
          entity: "Invoice",
          status: "changed",
          tableNameChange: { before: "legacy_invoices", after: undefined },
          addedFields: [],
          removedFields: [],
          changedFields: [],
        },
      ],
      relations: [
        { from: "User", to: "Post", fieldName: "posts", status: "added" },
        {
          from: "User",
          to: "Comment",
          fieldName: "comments",
          status: "removed",
        },
        {
          from: "Post",
          to: "Tag",
          fieldName: "tags",
          status: "changed",
          changes: [
            { property: "onDelete", before: undefined, after: "cascade" },
          ],
        },
      ],
    };

    expect(formatModelDiff(diff)).toEqual([
      "Post: added (new entity)",
      "Comment: removed",
      'User.email: isNullable (false → true), columnName ((none) → "user_email"), enumValues ((none) → [a, b])',
      "Order: table renamed (Order → orders)",
      "Invoice: table renamed (legacy_invoices → Invoice)",
      "User → Post: relation added",
      "User → Comment: relation removed",
      'Post → Tag: onDelete ((none) → "cascade")',
    ]);
  });
});

describe("modelSnapshotPath", () => {
  it("appends the snapshot suffix to the out base", () => {
    expect(modelSnapshotPath("out/erd")).toBe("out/erd.orm2erd-model.json");
  });
});

describe("readModelSnapshot / writeModelSnapshot", () => {
  it("round-trips a written model", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orm2erd-"));
    const path = join(dir, "erd.orm2erd-model.json");
    const m = model([entity("User", [field("id")])]);
    await writeModelSnapshot(path, m);
    expect(await readModelSnapshot(path)).toEqual(m);
  });

  it("returns null for a missing file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orm2erd-"));
    expect(await readModelSnapshot(join(dir, "nope.json"))).toBeNull();
  });

  it("returns null for corrupt JSON", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orm2erd-"));
    const path = join(dir, "erd.orm2erd-model.json");
    await writeFile(path, "{ not json", "utf-8");
    expect(await readModelSnapshot(path)).toBeNull();
  });

  it("returns null for a version mismatch", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orm2erd-"));
    const path = join(dir, "erd.orm2erd-model.json");
    await writeFile(
      path,
      JSON.stringify({
        version: MODEL_SNAPSHOT_VERSION + 1,
        model: model([entity("User", [field("id")])]),
      }),
      "utf-8",
    );
    expect(await readModelSnapshot(path)).toBeNull();
  });
});
