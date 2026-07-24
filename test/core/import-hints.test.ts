import { describe, it, expect } from "vitest";
import { friendlyImportHint } from "../../src/core/import-hints";

describe("friendlyImportHint", () => {
  it("hints at a missing target-project dependency for a MODULE_NOT_FOUND error", () => {
    const err = new Error("Cannot find module 'pg'");
    expect(friendlyImportHint(err)).toMatch(/Missing dependency "pg"/);
  });

  it("hints at a missing reflect-metadata import for a TypeORM decorator error", () => {
    const err = new Error("Reflect.getMetadata is not a function");
    expect(friendlyImportHint(err)).toMatch(/reflect-metadata/);
  });

  it("matches the reflect-metadata pattern from the stack, not just the message", () => {
    const err = new Error("something else entirely");
    err.stack =
      "Error: something else entirely\n    at Object.getMetadata (Reflect.getMetadata is not a function)";
    expect(friendlyImportHint(err)).toMatch(/reflect-metadata/);
  });

  it("hints at an eager database connection for a connection-refused error", () => {
    const err = new Error("connect ECONNREFUSED 127.0.0.1:5432");
    expect(friendlyImportHint(err)).toMatch(/database connection/);
  });

  it("hints at a CJS/ESM mismatch for an ES-module-scope error", () => {
    const err = new Error("__dirname is not defined in ES module scope");
    expect(friendlyImportHint(err)).toMatch(/CommonJS\/ESM mismatch/);
  });

  it("returns undefined for an error that matches no known pattern", () => {
    const err = new Error("Something entirely unrelated went wrong");
    expect(friendlyImportHint(err)).toBeUndefined();
  });

  it("returns undefined for a non-Error thrown value", () => {
    expect(friendlyImportHint("just a string")).toBeUndefined();
  });
});
