import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPackageJson } from "../../src/core/package";

describe("readPackageJson", () => {
  const dirs: string[] = [];

  function makeTmpDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "orm2erd-package-test-"));
    dirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns undefined when package.json doesn't exist", () => {
    const dir = makeTmpDir();
    expect(readPackageJson(dir)).toBeUndefined();
  });

  it("returns the parsed contents when package.json is valid", () => {
    const dir = makeTmpDir();
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        version: "1.2.3",
        dependencies: { sequelize: "^6.0.0" },
      }),
    );
    expect(readPackageJson(dir)).toEqual({
      version: "1.2.3",
      dependencies: { sequelize: "^6.0.0" },
    });
  });

  it("returns undefined when package.json contains invalid JSON", () => {
    const dir = makeTmpDir();
    writeFileSync(join(dir, "package.json"), "{ not valid json");
    expect(readPackageJson(dir)).toBeUndefined();
  });
});
