import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzleDetector } from "../../src/detect/drizzle";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/drizzle/detect",
);

describe("drizzleDetector.detect", () => {
  it("reports not found when there's no package.json", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "orm2erd-drizzle-detect-"));
    const result = await drizzleDetector.detect(emptyDir);
    expect(result).toEqual({ found: false, candidates: [], confidence: 0 });
  });

  it("reports not found when package.json isn't valid JSON", async () => {
    const result = await drizzleDetector.detect(
      join(fixturesDir, "invalid-package-json"),
    );
    expect(result).toEqual({ found: false, candidates: [], confidence: 0 });
  });

  it("reports not found when drizzle-orm isn't a dependency", async () => {
    const result = await drizzleDetector.detect(
      join(fixturesDir, "no-drizzle-dep"),
    );
    expect(result).toEqual({ found: false, candidates: [], confidence: 0 });
  });

  it("reports not found when drizzle-orm is a dependency but no config file exists", async () => {
    const result = await drizzleDetector.detect(
      join(fixturesDir, "no-candidates"),
    );
    expect(result).toEqual({ found: false, candidates: [], confidence: 0 });
  });

  it("finds a drizzle.config.ts", async () => {
    const result = await drizzleDetector.detect(join(fixturesDir, "ts-config"));
    expect(result).toEqual({
      found: true,
      candidates: ["drizzle.config.ts"],
      confidence: 1,
    });
  });

  it("finds a drizzle.config.js", async () => {
    const result = await drizzleDetector.detect(join(fixturesDir, "js-config"));
    expect(result).toEqual({
      found: true,
      candidates: ["drizzle.config.js"],
      confidence: 1,
    });
  });

  it("finds a drizzle.config.json when it's the only one, even via devDependencies", async () => {
    const result = await drizzleDetector.detect(join(fixturesDir, "json-only"));
    expect(result).toEqual({
      found: true,
      candidates: ["drizzle.config.json"],
      confidence: 1,
    });
  });

  it("prefers drizzle.config.ts over drizzle.config.json when both exist", async () => {
    const result = await drizzleDetector.detect(
      join(fixturesDir, "priority-ts-over-json"),
    );
    expect(result).toEqual({
      found: true,
      candidates: ["drizzle.config.ts"],
      confidence: 1,
    });
  });
});
