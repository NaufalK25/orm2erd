import { describe, it, expect } from "vitest";
import { applyInflect } from "../../src/core/inflect";

describe("applyInflect", () => {
  it("preserve: returns the identifier unchanged", () => {
    expect(applyInflect("User", "preserve")).toBe("User");
    expect(applyInflect("Users", "preserve")).toBe("Users");
  });

  it("returns an empty string as-is regardless of mode", () => {
    expect(applyInflect("", "plural")).toBe("");
  });

  it("plural: pluralizes a singular identifier", () => {
    expect(applyInflect("User", "plural")).toBe("Users");
    expect(applyInflect("post_tag", "plural")).toBe("post_tags");
  });

  it("plural: is idempotent on an already-plural identifier", () => {
    expect(applyInflect("Users", "plural")).toBe("Users");
    expect(applyInflect("users", "plural")).toBe("users");
  });

  it("singular: singularizes a plural identifier", () => {
    expect(applyInflect("Users", "singular")).toBe("User");
    expect(applyInflect("post_tags", "singular")).toBe("post_tag");
  });

  it("singular: is idempotent on an already-singular identifier", () => {
    expect(applyInflect("User", "singular")).toBe("User");
  });

  it("uses the irregular-word dictionary, not a naive +s/-s rule", () => {
    expect(applyInflect("person", "plural")).toBe("people");
    expect(applyInflect("people", "singular")).toBe("person");
  });

  it("inflects only the trailing word of a compound PascalCase identifier", () => {
    expect(applyInflect("PostTag", "plural")).toBe("PostTags");
    expect(applyInflect("PostTags", "singular")).toBe("PostTag");
  });
});
