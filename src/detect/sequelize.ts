import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { Detector } from "./types";

const require = createRequire(import.meta.url);

export const sequelizeDetector: Detector = {
  name: "sequelize",

  async detect(cwd) {
    const candidates: string[] = [];

    const packageJsonPath = resolve(cwd, "package.json");
    if (!existsSync(packageJsonPath)) {
      return { found: false, candidates, confidence: 0 };
    }

    interface PackageJson {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    }

    let packageJson: PackageJson;
    try {
      packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    } catch {
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
        if (typeof modelsPath === "string") {
          candidates.push(resolve(cwd, modelsPath));
        }
      } catch {}
    }

    if (candidates.length === 0) {
      const fallbackDirs = ["models", "src/models", "db/models", "app/models"];
      for (const dir of fallbackDirs) {
        const candidate = resolve(cwd, dir);
        if (existsSync(candidate) && statSync(candidate).isDirectory()) {
          candidates.push(candidate);
        }
      }
    }

    return {
      found: candidates.length > 0,
      candidates,
      confidence: candidates.length === 1 ? 1 : candidates.length > 1 ? 0.5 : 0,
    };
  },
};
