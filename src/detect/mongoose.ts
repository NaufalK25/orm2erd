import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Detector } from "./types";
import { PackageJson } from "../core/package";
import { looksLikeMongooseSchemaSource } from "../adapters/mongoose/schema-source";

// Mongoose has no config file or folder convention, so this content scan is
// the fallback of last resort.
const EXCLUDED_DIR_NAMES = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".git",
  ".next",
  ".turbo",
]);
// Safety valve for pathological monorepos.
const MAX_FILES_SCANNED = 5000;
// Skip oversized files (e.g. a committed dist/ or large fixture) before reading.
const MAX_FILE_SIZE_BYTES = 1_000_000;

function findMongooseSchemaDirs(cwd: string): string[] {
  const matchedDirs = new Set<string>();
  const stack: string[] = [cwd];
  let filesScanned = 0;

  while (stack.length > 0 && filesScanned < MAX_FILES_SCANNED) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      // Symlinks are neither isDirectory() nor isFile() here (lstat
      // semantics) — skipped on purpose, to avoid monorepo symlink cycles.
      if (entry.isDirectory()) {
        // Prune before pushing, not after, so we never descend into node_modules.
        if (
          !EXCLUDED_DIR_NAMES.has(entry.name) &&
          !entry.name.startsWith(".")
        ) {
          stack.push(join(dir, entry.name));
        }
        continue;
      }

      if (!entry.isFile() || !/\.(m|c)?[jt]s$/.test(entry.name)) continue;
      if (entry.name.endsWith(".d.ts")) continue; // type-only, no runtime calls

      filesScanned++;
      if (filesScanned > MAX_FILES_SCANNED) break;

      const filePath = join(dir, entry.name);

      try {
        if (statSync(filePath).size > MAX_FILE_SIZE_BYTES) continue;
      } catch {
        continue;
      }

      let content: string;
      try {
        content = readFileSync(filePath, "utf-8");
      } catch {
        continue;
      }

      if (looksLikeMongooseSchemaSource(content)) {
        matchedDirs.add(relative(cwd, dir) || ".");
      }
    }
  }

  return Array.from(matchedDirs);
}

export const mongooseDetector: Detector = {
  name: "mongoose",

  async detect(cwd) {
    const candidates: string[] = [];

    const packageJsonPath = resolve(cwd, "package.json");
    if (!existsSync(packageJsonPath)) {
      return { found: false, candidates, confidence: 0 };
    }

    let packageJson: PackageJson;
    try {
      packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    } catch {
      // Can't confirm the mongoose dependency without valid JSON, so bail
      // rather than continue probing the filesystem.
      return { found: false, candidates, confidence: 0 };
    }

    const hasMongooseDep =
      Boolean(packageJson?.dependencies?.mongoose) ||
      Boolean(packageJson?.devDependencies?.mongoose);

    if (!hasMongooseDep) {
      return { found: false, candidates, confidence: 0 };
    }

    if (candidates.length === 0) {
      const fallbackDirs = ["models", "src/models", "db/models", "app/models"];
      for (const dir of fallbackDirs) {
        const candidate = resolve(cwd, dir);
        if (existsSync(candidate) && statSync(candidate).isDirectory()) {
          candidates.push(relative(cwd, candidate));
        }
      }
    }

    // No naming convention hit — fall back to scanning file contents for
    // actual mongoose.model()/Schema() calls and use the directories those
    // land in as candidates instead of guessing a folder name.
    if (candidates.length === 0) {
      candidates.push(...findMongooseSchemaDirs(cwd));
    }

    return {
      found: candidates.length > 0,
      candidates,
      confidence: candidates.length === 1 ? 1 : candidates.length > 1 ? 0.5 : 0,
    };
  },
};
