import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prismaDetector } from "../../src/detect/prisma";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/prisma/detect",
);

describe("prismaDetector.detect", () => {
  it("reports not found when nothing is present", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "orm2erd-prisma-detect-"));
    const result = await prismaDetector.detect(emptyDir);
    expect(result).toEqual({ found: false, candidates: [], confidence: 0 });
  });

  it("finds the nested prisma/schema.prisma default", async () => {
    const result = await prismaDetector.detect(
      join(fixturesDir, "nested-default"),
    );
    expect(result).toEqual({
      found: true,
      candidates: ["prisma/schema.prisma"],
      confidence: 1,
    });
  });

  it("finds the root schema.prisma default", async () => {
    const result = await prismaDetector.detect(
      join(fixturesDir, "root-default"),
    );
    expect(result).toEqual({
      found: true,
      candidates: ["schema.prisma"],
      confidence: 1,
    });
  });

  it("resolves the schema path from prisma.config.* when present", async () => {
    const result = await prismaDetector.detect(
      join(fixturesDir, "config-only"),
    );
    expect(result).toEqual({
      found: true,
      candidates: ["custom/schema.prisma"],
      confidence: 1,
    });
  });

  it("lists the config schema and a leftover default as separate candidates", async () => {
    const result = await prismaDetector.detect(
      join(fixturesDir, "config-with-decoy"),
    );
    expect(result).toEqual({
      found: true,
      candidates: ["custom/schema.prisma", "prisma/schema.prisma"],
      confidence: 0.5,
    });
  });
});
