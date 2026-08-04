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

describe("buildNameResolver (caseMode)", () => {
  it("defaults to preserve when caseMode is omitted", () => {
    const names = buildNameResolver(model, "table");
    expect(names.entityId("User")).toBe("users");
    expect(names.fieldId(model.entities[0].fields[1])).toBe("full_name");
  });

  it("case-transforms entityId/fieldId/fieldIdByName", () => {
    const names = buildNameResolver(model, "table", "pascal");
    expect(names.entityId("User")).toBe("Users");
    expect(names.fieldId(model.entities[0].fields[1])).toBe("FullName");
    expect(names.fieldIdByName(model.entities[0], "fullName")).toBe("FullName");
  });

  it("never case-transforms entityAlias/fieldAlias", () => {
    const names = buildNameResolver(model, "both", "screaming_snake");
    expect(names.entityAlias("User")).toBe("User");
    expect(names.fieldAlias(model.entities[0].fields[1])).toBe("fullName");
  });

  it("applyCase transforms an arbitrary identifier the same way", () => {
    const names = buildNameResolver(model, "table", "kebab");
    expect(names.applyCase("fullName")).toBe("full-name");
  });
});

describe("buildNameResolver (inflectMode)", () => {
  it("defaults to preserve when inflectMode is omitted", () => {
    const names = buildNameResolver(model, "model");
    expect(names.entityId("User")).toBe("User");
  });

  it("pluralizes/singularizes entityId only", () => {
    const plural = buildNameResolver(model, "model", "preserve", "plural");
    expect(plural.entityId("User")).toBe("Users");
    expect(plural.entityId("Tag")).toBe("Tags");

    const singular = buildNameResolver(
      { entities: [{ name: "Users", fields: [] }], relations: [] },
      "model",
      "preserve",
      "singular",
    );
    expect(singular.entityId("Users")).toBe("User");
  });

  it("is idempotent on an entity name already in the requested number", () => {
    const names = buildNameResolver(model, "table", "preserve", "plural");
    // "users" (User's tableName) is already plural.
    expect(names.entityId("User")).toBe("users");
  });

  it("never inflects entityAlias/fieldId/fieldAlias/fieldIdByName", () => {
    const names = buildNameResolver(model, "both", "preserve", "plural");
    expect(names.entityAlias("User")).toBe("User");
    expect(names.fieldId(model.entities[0].fields[1])).toBe("full_name");
    expect(names.fieldAlias(model.entities[0].fields[1])).toBe("fullName");
    expect(names.fieldIdByName(model.entities[0], "fullName")).toBe(
      "full_name",
    );
  });

  it("inflects before case-transforming, per the documented ordering", () => {
    const postTagModel: ERDModel = {
      entities: [{ name: "PostTag", fields: [] }],
      relations: [],
    };
    const names = buildNameResolver(postTagModel, "model", "kebab", "plural");
    // "PostTag" -> inflect -> "PostTags" -> case -> "post-tags" (not
    // "post-tag-s" or any artifact of casing before inflecting).
    expect(names.entityId("PostTag")).toBe("post-tags");
  });
});
