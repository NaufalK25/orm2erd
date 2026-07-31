import { describe, it, expect, afterEach } from "vitest";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  confidenceFromCandidates,
  findFilesByContent,
} from "../../src/detect/shared";

describe("confidenceFromCandidates", () => {
  it("scores zero candidates as zero", () => {
    expect(confidenceFromCandidates([])).toBe(0);
  });

  it("scores a single candidate as certain", () => {
    expect(confidenceFromCandidates(["a"])).toBe(1);
  });

  it("splits certainty evenly across multiple equally-plausible candidates", () => {
    expect(confidenceFromCandidates(["a", "b"])).toBe(0.5);
    expect(confidenceFromCandidates(["a", "b", "c"])).toBe(0.33);
    expect(confidenceFromCandidates(["a", "b", "c", "d"])).toBe(0.25);
  });
});

describe("findFilesByContent", () => {
  const dirs: string[] = [];

  function makeTmpDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "orm2erd-shared-test-"));
    dirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      // A permission test may have stripped execute/read off a subdirectory;
      // restore it so the recursive removal itself doesn't fail.
      chmodSync(dir, 0o700);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns no matches (instead of throwing) when cwd itself can't be read as a directory", () => {
    const dir = makeTmpDir();
    const notADir = join(dir, "file.js");
    writeFileSync(notADir, "module.exports = require('sequelize');");
    // readdirSync(notADir) throws ENOTDIR — must be swallowed, not propagate.
    expect(findFilesByContent(notADir, () => true)).toEqual([]);
  });

  it("skips .d.ts files even when their content matches", () => {
    const dir = makeTmpDir();
    writeFileSync(join(dir, "types.d.ts"), "export const sequelize = 1;");
    writeFileSync(join(dir, "index.js"), "export const sequelize = 1;");
    expect(findFilesByContent(dir, () => true)).toEqual(["index.js"]);
  });

  it("skips files over the size cap even when their content matches", () => {
    const dir = makeTmpDir();
    writeFileSync(join(dir, "huge.js"), "x".repeat(1_000_001));
    writeFileSync(join(dir, "small.js"), "x");
    expect(findFilesByContent(dir, () => true)).toEqual(["small.js"]);
  });

  it("stops scanning once the file-count safety valve is hit", () => {
    const dir = makeTmpDir();
    const total = 5005;
    for (let i = 0; i < total; i++) {
      writeFileSync(join(dir, `f${i}.js`), "x");
    }
    // The 5000-file cap is hit mid-directory-listing, before the file that
    // would have pushed the count over is ever read/matched.
    expect(findFilesByContent(dir, () => true)).toHaveLength(5000);
  }, 20_000);

  it("skips a file it can't stat (e.g. no search permission on its directory)", () => {
    const dir = makeTmpDir();
    const sub = join(dir, "sub");
    mkdirSync(sub);
    writeFileSync(
      join(sub, "file.js"),
      "module.exports = require('sequelize');",
    );
    chmodSync(sub, 0o600); // read, no execute: readdir still lists it, stat can't resolve it
    try {
      expect(findFilesByContent(dir, () => true)).toEqual([]);
    } finally {
      chmodSync(sub, 0o700); // restore, or recursive cleanup can't traverse into it
    }
  });

  it("prunes excluded dir names (node_modules) and hidden dirs before descending, instead of just filtering their contents", () => {
    const dir = makeTmpDir();
    writeFileSync(join(dir, "match.js"), "export const sequelize = 1;");

    mkdirSync(join(dir, "node_modules"));
    writeFileSync(
      join(dir, "node_modules", "trap.js"),
      "export const sequelize = 1;",
    );

    mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, ".git", "trap.js"), "export const sequelize = 1;");

    expect(findFilesByContent(dir, () => true)).toEqual(["match.js"]);
  });

  it("skips a file it can't read (e.g. no read permission on the file itself)", () => {
    const dir = makeTmpDir();
    const f = join(dir, "secret.js");
    writeFileSync(f, "module.exports = require('sequelize');");
    chmodSync(f, 0o000);
    try {
      expect(findFilesByContent(dir, () => true)).toEqual([]);
    } finally {
      chmodSync(f, 0o644);
    }
  });
});
