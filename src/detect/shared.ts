import { existsSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

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
