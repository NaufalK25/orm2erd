import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateCheckRequiresOut,
  validateSummaryRequiresCheck,
} from "../../src/cli/resolve";
import { runCheck } from "../../src/cli/run";
import { checkOutput } from "../../src/core/check";
import {
  modelSnapshotPath,
  writeModelSnapshot,
} from "../../src/core/model-diff";
import { resolveOutPath } from "../../src/core/out-path";
import { prismaAdapter } from "../../src/adapters/prisma";
import { mermaidEmitter } from "../../src/emitters/mermaid";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const prismaFixture = join(repoRoot, "test/fixtures/e2e/prisma-app");

function mockExit() {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const exit = vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`process.exit(${code})`);
  }) as unknown as { mockRestore(): void };
  return { error, exit };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("validateCheckRequiresOut", () => {
  it("exits non-zero with a clear message when --check is used without --out non-interactively", () => {
    const { exit, error } = mockExit();
    expect(() => validateCheckRequiresOut(true, undefined, false)).toThrow(
      "process.exit(1)",
    );
    expect(exit).toHaveBeenCalledWith(1);
    expect(error.mock.calls.join("\n")).toContain(
      "--check requires --out <path> so it knows which committed file to verify against.",
    );
  });

  it("does not exit when --check is used with --out", () => {
    const { exit } = mockExit();
    expect(() => validateCheckRequiresOut(true, "erd", false)).not.toThrow();
    expect(exit).not.toHaveBeenCalled();
  });

  it("does not exit for a plain (non-check) run without --out", () => {
    const { exit } = mockExit();
    expect(() =>
      validateCheckRequiresOut(false, undefined, false),
    ).not.toThrow();
    expect(exit).not.toHaveBeenCalled();
  });

  it("does not exit when --check is used without --out interactively — defers to the prompt instead", () => {
    const { exit } = mockExit();
    expect(() => validateCheckRequiresOut(true, undefined, true)).not.toThrow();
    expect(exit).not.toHaveBeenCalled();
  });
});

describe("validateSummaryRequiresCheck", () => {
  it("exits non-zero with a clear message when --summary is used without --check", () => {
    const { exit, error } = mockExit();
    expect(() => validateSummaryRequiresCheck(false, true)).toThrow(
      "process.exit(1)",
    );
    expect(exit).toHaveBeenCalledWith(1);
    expect(error.mock.calls.join("\n")).toContain(
      "--summary requires --check — it's a presentation mode for the diff --check computes.",
    );
  });

  it("does not exit when --summary is used with --check", () => {
    const { exit } = mockExit();
    expect(() => validateSummaryRequiresCheck(true, true)).not.toThrow();
    expect(exit).not.toHaveBeenCalled();
  });

  it("does not exit when neither flag is passed", () => {
    const { exit } = mockExit();
    expect(() => validateSummaryRequiresCheck(false, false)).not.toThrow();
    expect(exit).not.toHaveBeenCalled();
  });
});

describe("--check against a custom/nested --out path", () => {
  let outDir: string;

  afterEach(() => {
    if (outDir) rmSync(outDir, { recursive: true, force: true });
  });

  it("finds and verifies the committed file instead of guessing erd.mmd", async () => {
    outDir = mkdtempSync(join(tmpdir(), "orm2erd-check-"));
    // A custom, nested --out — the exact shape (non-default name, under a
    // subdirectory) that a guessed "erd.mmd" default would miss entirely.
    const outBase = join(outDir, "docs", "generated", "erd");
    const outPath = resolveOutPath(outBase, "mmd", ["mmd"]);

    const entry = await prismaAdapter.resolveEntry(
      join(prismaFixture, "prisma", "schema.prisma"),
      prismaFixture,
    );
    const model = await prismaAdapter.extract(entry);
    const content = mermaidEmitter.emit(model, { typeMode: "canonical" });

    // Simulates writeFiles() writing to the exact path an explicit --out
    // resolves to.
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, content, "utf-8");

    // --check against that same explicit path finds it and reports ok —
    // this is the scenario that silently checked the wrong guessed path
    // ("erd.mmd" at cwd) before --out became mandatory for --check.
    const upToDate = await checkOutput(outPath, content);
    expect(upToDate.status).toBe("ok");

    // Corrupt the committed file: --check must report it as drifted, not
    // missing (which would mean it was looking at the wrong path).
    await writeFile(outPath, "stale content", "utf-8");
    const drifted = await checkOutput(outPath, content);
    expect(drifted.status).toBe("drift");
  });
});

describe("--check --summary", () => {
  let outDir: string;

  afterEach(() => {
    if (outDir) rmSync(outDir, { recursive: true, force: true });
  });

  it("prints a structural summary instead of the raw diff when a snapshot is available", async () => {
    outDir = mkdtempSync(join(tmpdir(), "orm2erd-check-summary-"));
    const outBase = join(outDir, "erd");
    const outPath = resolveOutPath(outBase, "mmd", ["mmd"]);

    const entry = await prismaAdapter.resolveEntry(
      join(prismaFixture, "prisma", "schema.prisma"),
      prismaFixture,
    );
    const model = await prismaAdapter.extract(entry);
    const originalContent = mermaidEmitter.emit(model, {
      typeMode: "canonical",
    });

    // Simulates a previous plain (write) run: the diagram plus its model
    // snapshot both land on disk.
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, originalContent, "utf-8");
    await writeModelSnapshot(modelSnapshotPath(outBase), model);

    // A structural change since that snapshot: a new field on the first
    // entity — precise, in-memory control over exactly what changed.
    const mutatedModel = structuredClone(model);
    mutatedModel.entities[0].fields.push({
      name: "newField",
      type: "string",
      nativeType: "String",
    });
    const mutatedContent = mermaidEmitter.emit(mutatedModel, {
      typeMode: "canonical",
    });

    const { error } = mockExit();
    await expect(
      runCheck([{ path: outPath, content: mutatedContent }], {
        model: mutatedModel,
        outBase,
        summary: true,
      }),
    ).rejects.toThrow("process.exit(1)");

    const output = error.mock.calls.flat().join("\n");
    expect(output).toContain(
      `${mutatedModel.entities[0].name}: +column "newField"`,
    );
    // The raw text diff must be suppressed in favor of the structural one.
    expect(output).not.toContain("(on disk)");
  });

  it("falls back to the raw diff with a note when no snapshot exists yet", async () => {
    outDir = mkdtempSync(join(tmpdir(), "orm2erd-check-summary-"));
    const outBase = join(outDir, "erd");
    const outPath = resolveOutPath(outBase, "mmd", ["mmd"]);

    const entry = await prismaAdapter.resolveEntry(
      join(prismaFixture, "prisma", "schema.prisma"),
      prismaFixture,
    );
    const model = await prismaAdapter.extract(entry);
    const content = mermaidEmitter.emit(model, { typeMode: "canonical" });

    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, "stale content, no snapshot written", "utf-8");

    const { error } = mockExit();
    await expect(
      runCheck([{ path: outPath, content }], {
        model,
        outBase,
        summary: true,
      }),
    ).rejects.toThrow("process.exit(1)");

    const output = error.mock.calls.flat().join("\n");
    expect(output).toContain("No structural snapshot found");
    expect(output).toContain("(on disk)");
  });
});
