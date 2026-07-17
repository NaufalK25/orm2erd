import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface PackageJson {
  version: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

// Shared by the sequelize/mongoose detectors, which both need to check for a
// dependency before probing the filesystem further. Returns undefined on any
// failure (missing file, invalid JSON) so callers can just bail detection
// rather than branch on the specific reason.
export function readPackageJson(cwd: string): PackageJson | undefined {
  const packageJsonPath = resolve(cwd, "package.json");
  if (!existsSync(packageJsonPath)) return undefined;
  try {
    return JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  } catch {
    return undefined;
  }
}
