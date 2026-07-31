import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mikroormDetector } from "../../src/detect/mikroorm";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/mikroorm/detect",
);

describe("mikroormDetector.detect", () => {
  it("reports not found when there's no package.json", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "orm2erd-mikroorm-detect-"));
    const result = await mikroormDetector.detect(emptyDir);
    expect(result).toEqual({ found: false, candidates: [], confidence: 0 });
  });

  it("reports not found when package.json isn't valid JSON", async () => {
    const result = await mikroormDetector.detect(
      join(fixturesDir, "invalid-package-json"),
    );
    expect(result).toEqual({ found: false, candidates: [], confidence: 0 });
  });

  it("reports not found when @mikro-orm/core isn't a dependency", async () => {
    const result = await mikroormDetector.detect(
      join(fixturesDir, "no-mikroorm-dep"),
    );
    expect(result).toEqual({ found: false, candidates: [], confidence: 0 });
  });

  it("reports not found when @mikro-orm/core is a dependency but no config file exists", async () => {
    const result = await mikroormDetector.detect(
      join(fixturesDir, "no-candidates"),
    );
    expect(result).toEqual({ found: false, candidates: [], confidence: 0 });
  });

  it("finds a conventional root mikro-orm.config.ts", async () => {
    const result = await mikroormDetector.detect(
      join(fixturesDir, "conventional-root-ts"),
    );
    expect(result).toEqual({
      found: true,
      candidates: ["mikro-orm.config.ts"],
      confidence: 1,
    });
  });

  it("finds a conventional src/mikro-orm.config.ts", async () => {
    const result = await mikroormDetector.detect(
      join(fixturesDir, "conventional-src-ts"),
    );
    expect(result).toEqual({
      found: true,
      candidates: [join("src", "mikro-orm.config.ts")],
      confidence: 1,
    });
  });

  it("finds a conventional root mikro-orm.config.js", async () => {
    const result = await mikroormDetector.detect(
      join(fixturesDir, "conventional-js"),
    );
    expect(result).toEqual({
      found: true,
      candidates: ["mikro-orm.config.js"],
      confidence: 1,
    });
  });

  it("finds a conventional dist/mikro-orm.config.js", async () => {
    const result = await mikroormDetector.detect(
      join(fixturesDir, "conventional-dist-js"),
    );
    expect(result).toEqual({
      found: true,
      candidates: [join("dist", "mikro-orm.config.js")],
      confidence: 1,
    });
  });

  it("prefers src/mikro-orm.config.ts over the root mikro-orm.config.ts", async () => {
    const result = await mikroormDetector.detect(
      join(fixturesDir, "priority-src-ts-over-root-ts"),
    );
    expect(result).toEqual({
      found: true,
      candidates: [join("src", "mikro-orm.config.ts")],
      confidence: 1,
    });
  });

  it("prefers mikro-orm.config.ts over mikro-orm.config.js", async () => {
    const result = await mikroormDetector.detect(
      join(fixturesDir, "priority-ts-over-js"),
    );
    expect(result).toEqual({
      found: true,
      candidates: ["mikro-orm.config.ts"],
      confidence: 1,
    });
  });

  it("prefers package.json's mikro-orm.configPaths over the conventional file list", async () => {
    const result = await mikroormDetector.detect(
      join(fixturesDir, "config-paths-from-package-json"),
    );
    expect(result).toEqual({
      found: true,
      candidates: [join("config", "custom.config.ts")],
      confidence: 1,
    });
  });
});
