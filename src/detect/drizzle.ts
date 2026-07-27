import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Detector } from "./types";
import { readPackageJson } from "../core/package";

// drizzle-kit's own default resolution order (ts > js > json) — mirrors
// `drizzleConfigFromFile` in drizzle-kit's CLI. Unlike TypeORM's legacy
// ormconfig, this is a single well-known default the tool itself falls back
// through, not several sibling conventions worth flagging as ambiguous — so
// only the highest-priority file that actually exists is suggested.
const CONFIG_FILE_PRIORITY = [
  "drizzle.config.ts",
  "drizzle.config.js",
  "drizzle.config.json",
];

export const drizzleDetector: Detector = {
  name: "drizzle",

  async detect(cwd) {
    const packageJson = readPackageJson(cwd);
    if (!packageJson) {
      return { found: false, candidates: [], confidence: 0 };
    }

    const hasDrizzleDep =
      Boolean(packageJson?.dependencies?.["drizzle-orm"]) ||
      Boolean(packageJson?.devDependencies?.["drizzle-orm"]);

    if (!hasDrizzleDep) {
      return { found: false, candidates: [], confidence: 0 };
    }

    const configFile = CONFIG_FILE_PRIORITY.find((file) =>
      existsSync(resolve(cwd, file)),
    );

    return {
      found: Boolean(configFile),
      candidates: configFile ? [configFile] : [],
      confidence: configFile ? 1 : 0,
    };
  },
};
