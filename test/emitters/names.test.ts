import { describe, it, expect, vi, afterEach } from "vitest";
import { buildNameResolver } from "../../src/emitters/names";
import type { ERDModel } from "../../src/core/model";

afterEach(() => {
  vi.restoreAllMocks();
});

const model: ERDModel = {
  entities: [
    {
      name: "User",
      tableName: "users",
      fields: [
        {
          name: "id",
          columnName: undefined,
          type: "int",
          nativeType: "INTEGER",
        },
        {
          name: "fullName",
          columnName: "full_name",
          type: "string",
          nativeType: "STRING",
        },
      ],
    },
    {
      // No tableName override — physical name equals model name.
      name: "Tag",
      fields: [{ name: "name", type: "string", nativeType: "STRING" }],
    },
  ],
  relations: [],
};

describe("buildNameResolver (mode: model)", () => {
  it("uses the model name as the identifier and never sets an alias", () => {
    const names = buildNameResolver(model, "model");
    expect(names.entityId("User")).toBe("User");
    expect(names.entityAlias("User")).toBeUndefined();
    expect(names.fieldId(model.entities[0].fields[1])).toBe("fullName");
    expect(names.fieldAlias(model.entities[0].fields[1])).toBeUndefined();
  });
});

describe("buildNameResolver (mode: table)", () => {
  it("uses the physical table/column name as the identifier", () => {
    const names = buildNameResolver(model, "table");
    expect(names.entityId("User")).toBe("users");
    expect(names.fieldId(model.entities[0].fields[1])).toBe("full_name");
  });

  it("falls back to the model name when there's no physical name override", () => {
    const names = buildNameResolver(model, "table");
    expect(names.entityId("Tag")).toBe("Tag");
    expect(names.fieldId(model.entities[1].fields[0])).toBe("name");
  });

  it("never sets an alias", () => {
    const names = buildNameResolver(model, "table");
    expect(names.entityAlias("User")).toBeUndefined();
    expect(names.fieldAlias(model.entities[0].fields[1])).toBeUndefined();
  });
});

describe("buildNameResolver (mode: both)", () => {
  it("uses the physical name as the identifier and the model name as the alias", () => {
    const names = buildNameResolver(model, "both");
    expect(names.entityId("User")).toBe("users");
    expect(names.entityAlias("User")).toBe("User");
    expect(names.fieldId(model.entities[0].fields[1])).toBe("full_name");
    expect(names.fieldAlias(model.entities[0].fields[1])).toBe("fullName");
  });

  it("omits the alias when the physical name and model name are identical", () => {
    const names = buildNameResolver(model, "both");
    expect(names.entityAlias("Tag")).toBeUndefined();
    expect(names.fieldAlias(model.entities[1].fields[0])).toBeUndefined();
    expect(names.fieldAlias(model.entities[0].fields[0])).toBeUndefined();
  });
});

describe("buildNameResolver table-name collisions", () => {
  const collidingModel: ERDModel = {
    entities: [
      { name: "User", tableName: "people", fields: [] },
      { name: "Post", tableName: "people", fields: [] },
    ],
    relations: [],
  };

  it("falls back to model names for both entities and warns", () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const names = buildNameResolver(collidingModel, "table");

    expect(names.entityId("User")).toBe("User");
    expect(names.entityId("Post")).toBe("Post");
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toMatch(/both map to table "people"/);
  });

  it("doesn't warn or collide when only one entity claims a table name", () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const names = buildNameResolver(model, "table");

    expect(names.entityId("User")).toBe("users");
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("buildNameResolver.fieldIdByName", () => {
  it("resolves a field referenced by its model-level name", () => {
    const names = buildNameResolver(model, "table");
    expect(names.fieldIdByName(model.entities[0], "fullName")).toBe(
      "full_name",
    );
  });

  it("falls back to the given name when no such field exists on the entity", () => {
    const names = buildNameResolver(model, "table");
    expect(names.fieldIdByName(model.entities[0], "nonexistent")).toBe(
      "nonexistent",
    );
  });
});
