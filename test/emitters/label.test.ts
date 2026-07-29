import { describe, it, expect } from "vitest";
import { relationLabel } from "../../src/emitters/label";
import type { Relation } from "../../src/core/model";

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
});
