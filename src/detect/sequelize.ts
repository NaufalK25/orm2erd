import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { relative, resolve } from "node:path";
import type { Detector } from "./types";
import { confidenceFromCandidates, findFallbackModelDirs } from "./shared";
import { readPackageJson } from "../core/package";

const require = createRequire(import.meta.url);

export const sequelizeDetector: Detector = {
  name: "sequelize",

  async detect(cwd) {
    const candidates: string[] = [];

    const packageJson = readPackageJson(cwd);
    if (!packageJson) {
      return { found: false, candidates, confidence: 0 };
    }

    const hasSequelizeDep =
      Boolean(packageJson?.dependencies?.sequelize) ||
      Boolean(packageJson?.dependencies?.["sequelize-typescript"]) ||
      Boolean(packageJson?.devDependencies?.sequelize) ||
      Boolean(packageJson?.devDependencies?.["sequelize-typescript"]);

    if (!hasSequelizeDep) {
      return { found: false, candidates, confidence: 0 };
    }

    const rcPath = resolve(cwd, ".sequelizerc");
    const rcFound = existsSync(rcPath);

    if (rcFound) {
      try {
        const rc = require(rcPath);
        const modelsPath = rc?.["models-path"];
        // resolve() is a no-op on an already-absolute path, which is the
        // common case — .sequelizerc usually builds this with its own
        // path.resolve() call.
        if (typeof modelsPath === "string") {
          candidates.push(relative(cwd, resolve(cwd, modelsPath)));
        }
      } catch {
        // A broken .sequelizerc shouldn't fail detection outright — the
        // dependency check already confirmed this is a Sequelize project,
        // so just fall through to the directory conventions below.
      }
    }

    if (candidates.length === 0) {
      candidates.push(...findFallbackModelDirs(cwd));
    }

    return {
      found: candidates.length > 0,
      candidates,
      confidence: confidenceFromCandidates(candidates),
    };
  },
};
