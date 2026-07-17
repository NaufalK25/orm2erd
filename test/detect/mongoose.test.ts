import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mongooseDetector } from "../../src/detect/mongoose";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/mongoose/detect",
);

describe("mongooseDetector.detect", () => {
  it("reports not found when there's no package.json", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "orm2erd-mongoose-detect-"));
    const result = await mongooseDetector.detect(emptyDir);
    expect(result).toEqual({ found: false, candidates: [], confidence: 0 });
  });

  it("reports not found when package.json isn't valid JSON", async () => {
    const result = await mongooseDetector.detect(
      join(fixturesDir, "invalid-package-json"),
    );
    expect(result).toEqual({ found: false, candidates: [], confidence: 0 });
  });

  it("reports not found when mongoose isn't a dependency", async () => {
    const result = await mongooseDetector.detect(
      join(fixturesDir, "no-mongoose-dep"),
    );
    expect(result).toEqual({ found: false, candidates: [], confidence: 0 });
  });

  it("finds a single convention directory", async () => {
    const result = await mongooseDetector.detect(
      join(fixturesDir, "fallback-single-dir"),
    );
    expect(result).toEqual({
      found: true,
      candidates: ["models"],
      confidence: 1,
    });
  });

  it("lists multiple convention directories as ambiguous candidates", async () => {
    const result = await mongooseDetector.detect(
      join(fixturesDir, "fallback-multiple-dirs"),
    );
    expect(result).toEqual({
      found: true,
      candidates: ["models", "src/models"],
      confidence: 0.5,
    });
  });

  it("reports not found when mongoose is a dependency but nothing matches anywhere", async () => {
    const result = await mongooseDetector.detect(
      join(fixturesDir, "no-candidates"),
    );
    expect(result).toEqual({ found: false, candidates: [], confidence: 0 });
  });

  it("falls back to a content scan and finds a single directory with no convention dir", async () => {
    const result = await mongooseDetector.detect(
      join(fixturesDir, "content-scan-single"),
    );
    expect(result).toEqual({
      found: true,
      candidates: ["src/db"],
      confidence: 1,
    });
  });

  it("content scan lists multiple directories as ambiguous candidates", async () => {
    const result = await mongooseDetector.detect(
      join(fixturesDir, "content-scan-multiple"),
    );
    expect(result.found).toBe(true);
    expect(result.candidates.toSorted()).toEqual(["moduleA", "moduleB"]);
    expect(result.confidence).toBe(0.5);
  });

  it("content scan matches a destructured bare model()/Schema() call, not just mongoose.model()", async () => {
    const result = await mongooseDetector.detect(
      join(fixturesDir, "content-scan-destructured"),
    );
    expect(result).toEqual({
      found: true,
      candidates: ["definitions"],
      confidence: 1,
    });
  });

  it("content scan matches TypeScript generic syntax (model<IUser>(...))", async () => {
    const result = await mongooseDetector.detect(
      join(fixturesDir, "content-scan-generics"),
    );
    expect(result).toEqual({
      found: true,
      candidates: ["defs"],
      confidence: 1,
    });
  });

  it("content scan ignores a Schema()/model()-shaped file that doesn't import mongoose", async () => {
    const result = await mongooseDetector.detect(
      join(fixturesDir, "content-scan-false-positive-guard"),
    );
    expect(result).toEqual({ found: false, candidates: [], confidence: 0 });
  });
});
