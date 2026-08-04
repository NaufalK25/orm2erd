import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCheckRequiresOut } from "../../src/cli/resolve";
import { checkOutput } from "../../src/core/check";
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
  it("exits non-zero with a clear message when --check is used without --out", () => {
    const { exit, error } = mockExit();
    expect(() => validateCheckRequiresOut(true, undefined)).toThrow(
      "process.exit(1)",
    );
    expect(exit).toHaveBeenCalledWith(1);
    expect(error.mock.calls.join("\n")).toContain(
      "--check requires --out <path> so it knows which committed file to verify against.",
    );
  });

  it("does not exit when --check is used with --out", () => {
    const { exit } = mockExit();
    expect(() => validateCheckRequiresOut(true, "erd")).not.toThrow();
    expect(exit).not.toHaveBeenCalled();
  });

  it("does not exit for a plain (non-check) run without --out", () => {
    const { exit } = mockExit();
    expect(() => validateCheckRequiresOut(false, undefined)).not.toThrow();
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
