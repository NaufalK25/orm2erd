import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { typeormDetector } from "../../src/detect/typeorm";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/typeorm/detect",
);

describe("typeormDetector.detect", () => {
  it("reports not found when there's no package.json", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "orm2erd-typeorm-detect-"));
    const result = await typeormDetector.detect(emptyDir);
    expect(result).toEqual({ found: false, candidates: [], confidence: 0 });
  });

  it("reports not found when package.json isn't valid JSON", async () => {
    const result = await typeormDetector.detect(
      join(fixturesDir, "invalid-package-json"),
    );
    expect(result).toEqual({ found: false, candidates: [], confidence: 0 });
  });

  it("reports not found when typeorm isn't a dependency", async () => {
    const result = await typeormDetector.detect(
      join(fixturesDir, "no-typeorm-dep"),
    );
    expect(result).toEqual({ found: false, candidates: [], confidence: 0 });
  });

  it("reports not found when typeorm is a dependency but nothing matches anywhere", async () => {
    const result = await typeormDetector.detect(
      join(fixturesDir, "no-candidates"),
    );
    expect(result).toEqual({ found: false, candidates: [], confidence: 0 });
  });

  it("finds a legacy ormconfig.json", async () => {
    const result = await typeormDetector.detect(
      join(fixturesDir, "legacy-ormconfig-json"),
    );
    expect(result).toEqual({
      found: true,
      candidates: ["ormconfig.json"],
      confidence: 1,
    });
  });

  it("prefers ormconfig.js over ormconfig.json when both exist", async () => {
    const result = await typeormDetector.detect(
      join(fixturesDir, "legacy-ormconfig-priority"),
    );
    expect(result).toEqual({
      found: true,
      candidates: ["ormconfig.js"],
      confidence: 1,
    });
  });

  it("finds a single conventional data-source file with no ormconfig", async () => {
    const result = await typeormDetector.detect(
      join(fixturesDir, "conventional-single"),
    );
    expect(result).toEqual({
      found: true,
      candidates: ["src/data-source.js"],
      confidence: 1,
    });
  });

  it("lists multiple conventional data-source files as ambiguous candidates", async () => {
    const result = await typeormDetector.detect(
      join(fixturesDir, "conventional-multiple"),
    );
    expect(result).toEqual({
      found: true,
      candidates: ["src/data-source.js", "data-source.js"],
      confidence: 0.5,
    });
  });

  it("falls back to a content scan and finds a single file with no convention match", async () => {
    const result = await typeormDetector.detect(
      join(fixturesDir, "content-scan-single"),
    );
    expect(result).toEqual({
      found: true,
      candidates: [join("src", "db", "connection.js")],
      confidence: 1,
    });
  });

  it("content scan lists multiple files as ambiguous candidates", async () => {
    const result = await typeormDetector.detect(
      join(fixturesDir, "content-scan-multiple"),
    );
    expect(result.found).toBe(true);
    expect(result.candidates.toSorted()).toEqual(
      [
        join("moduleA", "connection.js"),
        join("moduleB", "connection.js"),
      ].toSorted(),
    );
    expect(result.confidence).toBe(0.5);
  });

  it("content scan ignores a DataSource-shaped file that doesn't import typeorm", async () => {
    const result = await typeormDetector.detect(
      join(fixturesDir, "content-scan-false-positive-guard"),
    );
    expect(result).toEqual({ found: false, candidates: [], confidence: 0 });
  });
});
