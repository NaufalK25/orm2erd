import { createRequire } from "node:module";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";

// Imports one of the target project's own files via tsx. tsImport loads it
// as ESM, where the CJS globals don't exist — polyfilled first, since real
// codebases (e.g. sequelize-cli's generated models/index.js) use all three.
export async function importTarget(path: string): Promise<unknown> {
  globalThis.require = createRequire(path);
  globalThis.__filename = path;
  globalThis.__dirname = dirname(path);
  return tsImport(pathToFileURL(path).href, import.meta.url);
}

// Export shapes vary a lot in the wild (named export, default export, CJS
// `db.sequelize`, double-wrapped CJS-in-ESM, a Model class's static
// `.sequelize`), so search a few levels deep instead of guessing paths.
// Functions are descended into too, since classes carry statics.
const MAX_EXPORT_SEARCH_DEPTH = 3;

export function findExport<T>(
  value: unknown,
  isMatch: (value: unknown) => value is T,
  depth = 0,
): T | undefined {
  if (isMatch(value)) return value;
  if (depth >= MAX_EXPORT_SEARCH_DEPTH) return undefined;
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null
  ) {
    return undefined;
  }

  for (const nested of Object.values(value)) {
    const found = findExport(nested, isMatch, depth + 1);
    if (found) return found;
  }
  return undefined;
}
