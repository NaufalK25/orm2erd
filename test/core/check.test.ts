import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalize, diffLines, checkOutput } from "../../src/core/check";

describe("normalize", () => {
  it("collapses CRLF to LF", () => {
    expect(normalize("a\r\nb")).toBe("a\nb");
  });
  it("strips trailing newlines", () => {
    expect(normalize("a\nb\n\n")).toBe("a\nb");
  });
  it("leaves interior whitespace alone", () => {
    expect(normalize("a  b")).toBe("a  b");
  });
});

describe("diffLines", () => {
  it("shows -/+ for a changed line", () => {
    const d = diffLines("erd.mmd", "x\nold\nz", "x\nnew\nz");
    expect(d).toContain("- old");
    expect(d).toContain("+ new");
  });
});

describe("checkOutput", () => {
  it("returns ok when content matches (ignoring trailing newline)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orm2erd-"));
    const p = join(dir, "erd.mmd");
    await writeFile(p, "same\n");
    expect((await checkOutput(p, "same")).status).toBe("ok");
  });

  it("returns drift when content differs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orm2erd-"));
    const p = join(dir, "erd.mmd");
    await writeFile(p, "old");
    const r = await checkOutput(p, "new");
    expect(r.status).toBe("drift");
    expect(r.diff).toContain("+ new");
  });

  it("returns missing when the file does not exist", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orm2erd-"));
    const r = await checkOutput(join(dir, "nope.mmd"), "whatever");
    expect(r.status).toBe("missing");
  });
});
