import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sequelizeDetector } from "../../src/detect/sequelize";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/sequelize/detect",
);

describe("sequelizeDetector.detect", () => {
  it("reports not found when there's no package.json", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "orm2erd-sequelize-detect-"));
    const result = await sequelizeDetector.detect(emptyDir);
    expect(result).toEqual({ found: false, candidates: [], confidence: 0 });
  });

  it("reports not found when package.json isn't valid JSON", async () => {
    const result = await sequelizeDetector.detect(
      join(fixturesDir, "invalid-package-json"),
    );
    expect(result).toEqual({ found: false, candidates: [], confidence: 0 });
  });

  it("reports not found when sequelize isn't a dependency", async () => {
    const result = await sequelizeDetector.detect(
      join(fixturesDir, "no-sequelize-dep"),
    );
    expect(result).toEqual({ found: false, candidates: [], confidence: 0 });
  });

  it("uses .sequelizerc's models-path when present", async () => {
    const cwd = join(fixturesDir, "rc-with-models-path");
    const result = await sequelizeDetector.detect(cwd);
    expect(result).toEqual({
      found: true,
      candidates: [join(cwd, "src/models")],
      confidence: 1,
    });
  });

  it("falls back to convention directories when .sequelizerc throws", async () => {
    const cwd = join(fixturesDir, "broken-rc");
    const result = await sequelizeDetector.detect(cwd);
    expect(result).toEqual({
      found: true,
      candidates: [join(cwd, "models")],
      confidence: 1,
    });
  });

  it("finds a single convention directory with no .sequelizerc", async () => {
    const cwd = join(fixturesDir, "fallback-single-dir");
    const result = await sequelizeDetector.detect(cwd);
    expect(result).toEqual({
      found: true,
      candidates: [join(cwd, "models")],
      confidence: 1,
    });
  });

  it("lists multiple convention directories as ambiguous candidates", async () => {
    const cwd = join(fixturesDir, "fallback-multiple-dirs");
    const result = await sequelizeDetector.detect(cwd);
    expect(result).toEqual({
      found: true,
      candidates: [join(cwd, "models"), join(cwd, "src/models")],
      confidence: 0.5,
    });
  });

  it("reports not found when sequelize is a dependency but no models location is found", async () => {
    const result = await sequelizeDetector.detect(
      join(fixturesDir, "no-candidates"),
    );
    expect(result).toEqual({ found: false, candidates: [], confidence: 0 });
  });
});
