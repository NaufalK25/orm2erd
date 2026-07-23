import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  normalize,
  diffRows,
  diffWords,
  checkOutput,
} from "../../src/core/check";

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

describe("diffRows", () => {
  it("reports a similar edited line as a single change (before/after)", () => {
    expect(diffRows("x\nold value\nz", "x\nnew value\nz")).toEqual([
      { kind: "change", before: "old value", after: "new value" },
    ]);
  });

  it("reports an inserted line as an add without offsetting the rest", () => {
    // Inserting "b" must NOT report a, c as changed — the LCS anchors them.
    expect(diffRows("a\nc", "a\nb\nc")).toEqual([{ kind: "add", line: "b" }]);
  });

  it("reports a deleted line as a remove", () => {
    expect(diffRows("a\nb\nc", "a\nc")).toEqual([
      { kind: "remove", line: "b" },
    ]);
  });

  it("classifies a run of edited lines as changes", () => {
    // Every line differs (as with a canonical<->native type-mode switch).
    expect(diffRows("Int x\nString y", "int x\nstring y")).toEqual([
      { kind: "change", before: "Int x", after: "int x" },
      { kind: "change", before: "String y", after: "string y" },
    ]);
  });

  it("does not fuse a dissimilar delete and insert into one change", () => {
    // These share no words, so they're a separate remove + add, not a change.
    expect(diffRows("string ghostField", "datetime deletedAt")).toEqual([
      { kind: "remove", line: "string ghostField" },
      { kind: "add", line: "datetime deletedAt" },
    ]);
  });

  it("separates an insertion from an adjacent real edit", () => {
    // "String? y" is inserted; "Int x" -> "int x" is still recognized as an edit.
    expect(diffRows("a\nInt x", "a\nString? y\nint x")).toEqual([
      { kind: "change", before: "Int x", after: "int x" },
      { kind: "add", line: "String? y" },
    ]);
  });
});

const joinText = (segs: { text: string }[]) => segs.map((s) => s.text).join("");

describe("diffWords", () => {
  it("marks only the changed word, keeping the rest unchanged", () => {
    const { removed, added } = diffWords("    Int id PK", "    int id PK");
    expect(joinText(removed)).toBe("    Int id PK"); // reconstructs the line
    expect(joinText(added)).toBe("    int id PK");
    expect(removed.filter((s) => s.changed).map((s) => s.text)).toEqual([
      "Int",
    ]);
    expect(added.filter((s) => s.changed).map((s) => s.text)).toEqual(["int"]);
  });

  it("marks nothing changed for identical lines", () => {
    const { removed, added } = diffWords("same line", "same line");
    expect(removed.every((s) => !s.changed)).toBe(true);
    expect(added.every((s) => !s.changed)).toBe(true);
  });

  it("handles a pure addition of trailing words", () => {
    const { removed, added } = diffWords("a b", "a b c");
    expect(removed.some((s) => s.changed)).toBe(false);
    // The trailing " c" (whitespace + word) is the only added part.
    expect(
      added
        .filter((s) => s.changed)
        .map((s) => s.text)
        .join(""),
    ).toBe(" c");
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
    await writeFile(p, "old value here");
    const r = await checkOutput(p, "new value here");
    expect(r.status).toBe("drift");
    expect(r.rows).toEqual([
      { kind: "change", before: "old value here", after: "new value here" },
    ]);
  });

  it("returns missing when the file does not exist", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orm2erd-"));
    const r = await checkOutput(join(dir, "nope.mmd"), "whatever");
    expect(r.status).toBe("missing");
  });
});
