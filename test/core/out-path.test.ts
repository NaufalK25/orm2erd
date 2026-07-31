import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expandOutDir, resolveOutPath } from "../../src/core/out-path";

describe("resolveOutPath", () => {
  it("appends the extension to a bare name (single format)", () => {
    expect(resolveOutPath("erd", "mmd", ["mmd"])).toBe("erd.mmd");
  });

  it("uses an explicit filename as-is (single format)", () => {
    expect(resolveOutPath("erd.md", "mmd", ["mmd"])).toBe("erd.md");
  });

  it("appends the extension to a bare name (multiple formats)", () => {
    expect(resolveOutPath("erd", "dbml", ["mmd", "dbml"])).toBe("erd.dbml");
  });

  it("swaps a matching extension for each emitter's own (multiple formats)", () => {
    expect(resolveOutPath("erd.mmd", "dbml", ["mmd", "dbml"])).toBe("erd.dbml");
  });

  it("treats a non-matching extension as part of the name (multiple formats)", () => {
    expect(resolveOutPath("file.erd", "dbml", ["mmd", "dbml"])).toBe(
      "file.erd.dbml",
    );
  });
});

describe("expandOutDir", () => {
  it("appends the default basename when the path has a trailing slash", async () => {
    expect(await expandOutDir("./docs/")).toBe(join("docs", "erd"));
  });

  it("appends the default basename when the path already exists as a directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orm2erd-out-path-"));
    const sub = join(dir, "docs");
    await mkdir(sub);
    expect(await expandOutDir(sub)).toBe(join(sub, "erd"));
  });

  it("leaves a bare name that doesn't exist as a directory unchanged", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orm2erd-out-path-"));
    const target = join(dir, "erd");
    expect(await expandOutDir(target)).toBe(target);
  });

  it("leaves an explicit filename unchanged", async () => {
    expect(await expandOutDir("./docs/erd.mmd")).toBe("./docs/erd.mmd");
  });

  it("uses a custom default basename when given", async () => {
    expect(await expandOutDir("./docs/", "schema")).toBe(
      join("docs", "schema"),
    );
  });
});
