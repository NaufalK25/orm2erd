import { describe, it, expect } from "vitest";
import { toCase } from "../../src/core/case-transform";

describe("toCase", () => {
  it("preserve: returns the identifier unchanged", () => {
    expect(toCase("full_name", "preserve")).toBe("full_name");
    expect(toCase("FullName", "preserve")).toBe("FullName");
  });

  it("returns an empty string as-is regardless of mode", () => {
    expect(toCase("", "snake")).toBe("");
  });

  describe.each([
    { source: "full_name", label: "snake_case" },
    { source: "fullName", label: "camelCase" },
    { source: "FullName", label: "PascalCase" },
    { source: "full-name", label: "kebab-case" },
    { source: "FULL_NAME", label: "SCREAMING_SNAKE" },
  ])("from $label ($source)", ({ source }) => {
    it("converts to snake", () => {
      expect(toCase(source, "snake")).toBe("full_name");
    });
    it("converts to screaming_snake", () => {
      expect(toCase(source, "screaming_snake")).toBe("FULL_NAME");
    });
    it("converts to camel", () => {
      expect(toCase(source, "camel")).toBe("fullName");
    });
    it("converts to pascal", () => {
      expect(toCase(source, "pascal")).toBe("FullName");
    });
    it("converts to kebab", () => {
      expect(toCase(source, "kebab")).toBe("full-name");
    });
    it("converts to title", () => {
      expect(toCase(source, "title")).toBe("Full Name");
    });
  });

  it("lower: folds letters without touching separators", () => {
    expect(toCase("full_name", "lower")).toBe("full_name");
    expect(toCase("FullName", "lower")).toBe("fullname");
    expect(toCase("FULL-NAME", "lower")).toBe("full-name");
  });

  it("upper: folds letters without touching separators", () => {
    expect(toCase("full_name", "upper")).toBe("FULL_NAME");
    expect(toCase("FullName", "upper")).toBe("FULLNAME");
    expect(toCase("full-name", "upper")).toBe("FULL-NAME");
  });

  it("splits acronym-then-word boundaries (e.g. HTTPServer)", () => {
    expect(toCase("HTTPServer", "snake")).toBe("http_server");
    expect(toCase("HTTPServer", "kebab")).toBe("http-server");
  });

  it("handles a single already-lowercase word", () => {
    expect(toCase("id", "snake")).toBe("id");
    expect(toCase("id", "pascal")).toBe("Id");
    expect(toCase("id", "camel")).toBe("id");
  });

  it("handles digits attached to a word", () => {
    expect(toCase("field2Name", "snake")).toBe("field2_name");
  });

  describe.each([
    { source: "user_account_status", label: "snake_case" },
    { source: "userAccountStatus", label: "camelCase" },
    { source: "UserAccountStatus", label: "PascalCase" },
    { source: "user-account-status", label: "kebab-case" },
    { source: "USER_ACCOUNT_STATUS", label: "SCREAMING_SNAKE" },
  ])("more than two words — from $label ($source)", ({ source }) => {
    it("converts to snake", () => {
      expect(toCase(source, "snake")).toBe("user_account_status");
    });
    it("converts to screaming_snake", () => {
      expect(toCase(source, "screaming_snake")).toBe("USER_ACCOUNT_STATUS");
    });
    it("converts to camel", () => {
      expect(toCase(source, "camel")).toBe("userAccountStatus");
    });
    it("converts to pascal", () => {
      expect(toCase(source, "pascal")).toBe("UserAccountStatus");
    });
    it("converts to kebab", () => {
      expect(toCase(source, "kebab")).toBe("user-account-status");
    });
    it("converts to title", () => {
      expect(toCase(source, "title")).toBe("User Account Status");
    });
  });
});
