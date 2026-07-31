import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Detector } from "./types";
import { confidenceFromCandidates } from "./shared";
import { readPackageJson } from "../core/package";

// MikroORM's own CLI resolution order (`ConfigurationLoader.getConfigPaths()`),
// minus the `MIKRO_ORM_CLI_CONFIG` env var tier (env-only, no filesystem
// convention to check) — a single well-known priority chain the tool itself
// falls back through, same reasoning as the Drizzle detector's
// `CONFIG_FILE_PRIORITY`, so only the highest-priority file that actually
// exists is suggested rather than every sibling convention.
const CONFIG_FILE_PRIORITY = [
  "src/mikro-orm.config.ts",
  "mikro-orm.config.ts",
  "dist/mikro-orm.config.js",
  "build/mikro-orm.config.js",
  "src/mikro-orm.config.js",
  "mikro-orm.config.js",
];

// `package.json`'s `"mikro-orm": { "configPaths": [...] }` field overrides
// the conventional file list above and is checked first, mirroring the
// CLI's own precedence.
function configPathsFromPackageJson(
  packageJson: ReturnType<typeof readPackageJson>,
): string[] {
  const configPaths = (
    packageJson as { "mikro-orm"?: { configPaths?: unknown } } | undefined
  )?.["mikro-orm"]?.configPaths;
  return Array.isArray(configPaths)
    ? configPaths.filter((p): p is string => typeof p === "string")
    : [];
}

export const mikroormDetector: Detector = {
  name: "mikroorm",

  async detect(cwd) {
    const packageJson = readPackageJson(cwd);
    if (!packageJson) {
      return { found: false, candidates: [], confidence: 0 };
    }

    const hasMikroOrmDep =
      Boolean(packageJson?.dependencies?.["@mikro-orm/core"]) ||
      Boolean(packageJson?.devDependencies?.["@mikro-orm/core"]);

    if (!hasMikroOrmDep) {
      return { found: false, candidates: [], confidence: 0 };
    }

    const searchOrder = [
      ...configPathsFromPackageJson(packageJson),
      ...CONFIG_FILE_PRIORITY,
    ];
    const configFile = searchOrder.find((file) =>
      existsSync(resolve(cwd, file)),
    );
    const candidates = configFile ? [configFile] : [];

    return {
      found: candidates.length > 0,
      candidates,
      confidence: confidenceFromCandidates(candidates),
    };
  },
};
