import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createPhaseReporter,
  runCheck,
  writeFiles,
  type Output,
} from "../../src/cli/run";
import type { Entity, ERDModel, Field } from "../../src/core/model";
import {
  modelSnapshotPath,
  writeModelSnapshot,
} from "../../src/core/model-diff";

function field(name: string, overrides: Partial<Field> = {}): Field {
  return { name, type: "string", nativeType: "String", ...overrides };
}

function entity(name: string, fields: Field[]): Entity {
  return { name, fields };
}

function model(entities: Entity[]): ERDModel {
  return { entities, relations: [] };
}

function mockExit() {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const exit = vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`process.exit(${code})`);
  }) as unknown as { mockRestore(): void };
  return { log, error, exit };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("writeFiles", () => {
  let outDir: string;

  afterEach(() => {
    if (outDir) rmSync(outDir, { recursive: true, force: true });
  });

  it("writes a model snapshot alongside the diagram outputs", async () => {
    outDir = mkdtempSync(join(tmpdir(), "orm2erd-run-"));
    const outBase = join(outDir, "erd");
    const outputs: Output[] = [
      { path: `${outBase}.mmd`, content: "erDiagram" },
    ];
    const m = model([entity("User", [field("id")])]);
    const phase = createPhaseReporter(false, false);

    mockExit();
    await writeFiles(phase, outBase, outputs, m);

    expect(await readFile(`${outBase}.mmd`, "utf-8")).toBe("erDiagram");
    const snapshotPath = modelSnapshotPath(outBase);
    const snapshot = JSON.parse(await readFile(snapshotPath, "utf-8"));
    expect(snapshot).toEqual({ version: 1, model: m });
  });
});

describe("runCheck", () => {
  let outDir: string;

  afterEach(() => {
    if (outDir) rmSync(outDir, { recursive: true, force: true });
  });

  it("with summary:false behaves exactly as the plain text-diff check (regression guard)", async () => {
    outDir = mkdtempSync(join(tmpdir(), "orm2erd-run-"));
    const outBase = join(outDir, "erd");
    const outPath = `${outBase}.mmd`;
    await mkdir(outDir, { recursive: true });
    await writeFile(outPath, "old content", "utf-8");

    const m = model([entity("User", [field("id")])]);
    const { error } = mockExit();

    await expect(
      runCheck([{ path: outPath, content: "new content" }], {
        model: m,
        outBase,
        summary: false,
      }),
    ).rejects.toThrow("process.exit(1)");

    const output = error.mock.calls.flat().join("\n");
    expect(output).toContain("(on disk)");
    expect(output).not.toContain("Structural");
  });

  it("with summary:true and no snapshot on disk, notes the fallback and shows the raw diff", async () => {
    outDir = mkdtempSync(join(tmpdir(), "orm2erd-run-"));
    const outBase = join(outDir, "erd");
    const outPath = `${outBase}.mmd`;
    await mkdir(outDir, { recursive: true });
    await writeFile(outPath, "old content", "utf-8");

    const m = model([entity("User", [field("id")])]);
    const { error } = mockExit();

    await expect(
      runCheck([{ path: outPath, content: "new content" }], {
        model: m,
        outBase,
        summary: true,
      }),
    ).rejects.toThrow("process.exit(1)");

    const output = error.mock.calls.flat().join("\n");
    expect(output).toContain("No structural snapshot found");
    expect(output).toContain("(on disk)");
  });

  it("with summary:true and a snapshot showing a real structural change, shows bullets and suppresses the raw diff", async () => {
    outDir = mkdtempSync(join(tmpdir(), "orm2erd-run-"));
    const outBase = join(outDir, "erd");
    const outPath = `${outBase}.mmd`;
    await mkdir(outDir, { recursive: true });
    await writeFile(outPath, "old content", "utf-8");

    const previous = model([entity("User", [field("id")])]);
    await writeModelSnapshot(modelSnapshotPath(outBase), previous);

    const current = model([entity("User", [field("id"), field("email")])]);
    const { error } = mockExit();

    await expect(
      runCheck([{ path: outPath, content: "new content" }], {
        model: current,
        outBase,
        summary: true,
      }),
    ).rejects.toThrow("process.exit(1)");

    const output = error.mock.calls.flat().join("\n");
    expect(output).toContain('User: +column "email"');
    expect(output).not.toContain("(on disk)");
  });

  it("with summary:true and a snapshot showing no structural change, notes the fallback and shows the raw diff", async () => {
    outDir = mkdtempSync(join(tmpdir(), "orm2erd-run-"));
    const outBase = join(outDir, "erd");
    const outPath = `${outBase}.mmd`;
    await mkdir(outDir, { recursive: true });
    await writeFile(outPath, "old content", "utf-8");

    // The on-disk diagram text drifted (e.g. formatting), but the model
    // itself is unchanged from the snapshot — nothing structural to show.
    const m = model([entity("User", [field("id")])]);
    await writeModelSnapshot(modelSnapshotPath(outBase), m);
    const { error } = mockExit();

    await expect(
      runCheck([{ path: outPath, content: "new content" }], {
        model: m,
        outBase,
        summary: true,
      }),
    ).rejects.toThrow("process.exit(1)");

    const output = error.mock.calls.flat().join("\n");
    expect(output).toContain("No structural (schema-level) differences found");
    expect(output).toContain("(on disk)");
  });

  it("leaves missing-file messages unaffected by summary while still resolving drifted outputs structurally", async () => {
    outDir = mkdtempSync(join(tmpdir(), "orm2erd-run-"));
    const outBase = join(outDir, "erd");
    const outPath = `${outBase}.mmd`;
    const missingPath = join(outDir, "nope.mmd");
    await mkdir(outDir, { recursive: true });
    await writeFile(outPath, "old content", "utf-8");

    const previous = model([entity("User", [field("id")])]);
    await writeModelSnapshot(modelSnapshotPath(outBase), previous);
    const current = model([entity("User", [field("id"), field("email")])]);
    const { error } = mockExit();

    await expect(
      runCheck(
        [
          { path: outPath, content: "new content" },
          { path: missingPath, content: "whatever" },
        ],
        { model: current, outBase, summary: true },
      ),
    ).rejects.toThrow("process.exit(1)");

    const output = error.mock.calls.flat().join("\n");
    expect(output).toContain(
      `${missingPath} does not exist — run without --check to create it`,
    );
    expect(output).toContain('User: +column "email"');
  });
});
