import { describe, it, expect } from "vitest";
import { relationLabel, resolveRelationLabel } from "../../src/emitters/label";
import { buildNameResolver } from "../../src/emitters/names";
import type { ERDModel, Relation } from "../../src/core/model";

const base: Relation = { from: "A", to: "B", type: "1-n" };

describe("relationLabel", () => {
  it("appends the FK column when it differs from the alias", () => {
    expect(
      relationLabel({ ...base, fieldName: "posts", toColumn: "authorId" }),
    ).toBe("posts (authorId)");
  });

  it("returns the alias alone when there's no FK column", () => {
    expect(relationLabel({ ...base, fieldName: "posts" })).toBe("posts");
  });

  it("returns the FK column alone when there's no alias", () => {
    expect(relationLabel({ ...base, toColumn: "authorId" })).toBe("authorId");
  });

  it("doesn't duplicate when the alias and column are identical", () => {
    expect(
      relationLabel({ ...base, fieldName: "authorId", toColumn: "authorId" }),
    ).toBe("authorId");
  });

  it("returns an empty string when neither is present", () => {
    expect(relationLabel(base)).toBe("");
  });

  describe("mode: alias", () => {
    it("returns the alias even when a disambiguating column is present", () => {
      expect(
        relationLabel(
          { ...base, fieldName: "posts", toColumn: "authorId" },
          "alias",
        ),
      ).toBe("posts");
    });

    it("falls back to the column when there's no alias", () => {
      expect(relationLabel({ ...base, toColumn: "authorId" }, "alias")).toBe(
        "authorId",
      );
    });
  });

  describe("mode: column", () => {
    it("returns the column even when an alias is present", () => {
      expect(
        relationLabel(
          { ...base, fieldName: "posts", toColumn: "authorId" },
          "column",
        ),
      ).toBe("authorId");
    });

    it("falls back to the alias when there's no column", () => {
      expect(relationLabel({ ...base, fieldName: "posts" }, "column")).toBe(
        "posts",
      );
    });
  });
});

describe("resolveRelationLabel", () => {
  const model: ERDModel = {
    entities: [
      { name: "User", fields: [] },
      {
        name: "Post",
        fields: [
          {
            name: "authorId",
            columnName: "author_id",
            type: "int",
            nativeType: "INTEGER",
          },
        ],
      },
    ],
    relations: [],
  };
  const rel: Relation = { from: "User", to: "Post", type: "1-n" };

  it("resolves toColumn via the same entity/field lookup as fromColumn/primaryKey", () => {
    const names = buildNameResolver(model, "table");
    const label = resolveRelationLabel(
      model,
      { ...rel, fieldName: "posts", toColumn: "authorId" },
      names,
    );
    expect(label).toBe("posts (author_id)");
  });

  it("case-transforms both the alias and the resolved column", () => {
    const names = buildNameResolver(model, "table", "screaming_snake");
    const label = resolveRelationLabel(
      model,
      { ...rel, fieldName: "posts", toColumn: "authorId" },
      names,
    );
    expect(label).toBe("POSTS (AUTHOR_ID)");
  });

  it("case-transforms a fieldName that doesn't match any field on either entity", () => {
    // rel.fieldName is the association alias, not necessarily a real field —
    // it must still go through the case transform, just not fieldIdByName.
    const names = buildNameResolver(model, "table", "pascal");
    const label = resolveRelationLabel(
      model,
      { ...rel, fieldName: "posts" },
      names,
    );
    expect(label).toBe("Posts");
  });
});
