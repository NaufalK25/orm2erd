import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// A single candidate is treated as certain; multiple candidates as an
// ambiguous tie the user still has to break. Shared across all detectors so
// "confidence" means the same thing regardless of which ORM found it.
export function confidenceFromCandidates(candidates: string[]): number {
  return candidates.length === 1 ? 1 : candidates.length > 1 ? 0.5 : 0;
}

// Conventional model-directory names checked when nothing more specific
// (e.g. a config file) points at one — shared by the Sequelize and Mongoose
// detectors, which both fall back to the same guesses.
const FALLBACK_MODEL_DIRS = ["models", "src/models", "db/models", "app/models"];

export function findFallbackModelDirs(cwd: string): string[] {
  const candidates: string[] = [];
  for (const dir of FALLBACK_MODEL_DIRS) {
    const candidate = resolve(cwd, dir);
    if (existsSync(candidate) && statSync(candidate).isDirectory()) {
      candidates.push(relative(cwd, candidate));
    }
  }
  return candidates;
}

// Directory names skipped when scanning source files for content-based
// detection — never real user code, just build output/deps/vcs.
const EXCLUDED_SCAN_DIR_NAMES = new Set([
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

// Walks the project tree looking for source files whose content satisfies
// `isMatch` — the shared fallback of last resort for ORMs with no config
// file or folder convention to anchor detection on (e.g. Mongoose, TypeORM
// 0.3+ `DataSource` files). Returns paths relative to `cwd`.
export function findFilesByContent(
  cwd: string,
  isMatch: (content: string) => boolean,
): string[] {
  const matches: string[] = [];
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
          !EXCLUDED_SCAN_DIR_NAMES.has(entry.name) &&
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

      if (isMatch(content)) {
        matches.push(relative(cwd, filePath));
      }
    }
  }

  return matches;
}
