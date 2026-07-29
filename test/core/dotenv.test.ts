import { describe, it, expect, vi, afterEach } from "vitest";
import { loadDotEnvFiles } from "../../src/core/dotenv";

describe("loadDotEnvFiles", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads .env.local before .env, so .env.local wins on shared keys", () => {
    const calls: string[] = [];
    vi.spyOn(process, "loadEnvFile").mockImplementation(((file: string) => {
      calls.push(file);
    }) as typeof process.loadEnvFile);

    loadDotEnvFiles();

    expect(calls).toEqual([".env.local", ".env"]);
  });

  it("is best-effort: doesn't throw when a file is missing", () => {
    vi.spyOn(process, "loadEnvFile").mockImplementation(() => {
      throw new Error("ENOENT: no such file or directory");
    });

    expect(() => loadDotEnvFiles()).not.toThrow();
  });

  it("still attempts .env even when .env.local throws", () => {
    const calls: string[] = [];
    vi.spyOn(process, "loadEnvFile").mockImplementation(((file: string) => {
      calls.push(file);
      if (file === ".env.local") throw new Error("ENOENT");
    }) as typeof process.loadEnvFile);

    loadDotEnvFiles();

    expect(calls).toEqual([".env.local", ".env"]);
  });
});
