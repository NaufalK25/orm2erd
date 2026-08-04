import { describe, it, expect } from "vitest";
import { hasHyphen, hasSpace } from "../../src/emitters/quote";

describe("hasSpace", () => {
  it("detects a space", () => {
    expect(hasSpace("Full Name")).toBe(true);
  });
  it("returns false for no space", () => {
    expect(hasSpace("full-name")).toBe(false);
    expect(hasSpace("fullName")).toBe(false);
    expect(hasSpace("full_name")).toBe(false);
  });
});

describe("hasHyphen", () => {
  it("detects a hyphen", () => {
    expect(hasHyphen("full-name")).toBe(true);
  });
  it("returns false for no hyphen", () => {
    expect(hasHyphen("Full Name")).toBe(false);
    expect(hasHyphen("fullName")).toBe(false);
    expect(hasHyphen("full_name")).toBe(false);
  });
});
