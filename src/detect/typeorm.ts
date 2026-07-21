import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Detector } from "./types";
import { confidenceFromCandidates, findFilesByContent } from "./shared";
import { readPackageJson } from "../core/package";
import { looksLikeTypeOrmDataSourceSource } from "../adapters/typeorm/data-source-source";

// TypeORM <=0.2.x auto-discovered one of these at the project root via
// ConnectionOptionsReader; removed in 0.3+ but still seen in older
// codebases. Priority mirrors ConnectionOptionsReader's own load order
// ([js, ts, json, yml, yaml, xml] — env forms are connection-string-only,
// not schema-bearing, so skipped here).
const LEGACY_ORMCONFIG_EXTENSIONS = ["js", "ts", "json", "yml", "yaml", "xml"];

// Doc convention for the file that exports `new DataSource(...)` in 0.3+ —
// not enforced or auto-discovered by TypeORM itself, just the common name
// in the wild, so it's checked before falling back to a full content scan.
const DATA_SOURCE_FILE_CANDIDATES = [
  "src/data-source.ts",
  "src/data-source.js",
  "data-source.ts",
  "data-source.js",
];

function findLegacyOrmconfig(cwd: string): string | undefined {
  for (const ext of LEGACY_ORMCONFIG_EXTENSIONS) {
    const candidate = `ormconfig.${ext}`;
    if (existsSync(resolve(cwd, candidate))) return candidate;
  }
  return undefined;
}

export const typeormDetector: Detector = {
  name: "typeorm",

  async detect(cwd) {
    const candidates: string[] = [];

    const packageJson = readPackageJson(cwd);
    if (!packageJson) {
      return { found: false, candidates, confidence: 0 };
    }

    const hasTypeOrmDep =
      Boolean(packageJson?.dependencies?.typeorm) ||
      Boolean(packageJson?.devDependencies?.typeorm);

    if (!hasTypeOrmDep) {
      return { found: false, candidates, confidence: 0 };
    }

    // Legacy ormconfig is the strongest signal — same tier as Sequelize's
    // .sequelizerc — so it wins outright when present.
    const legacyOrmconfig = findLegacyOrmconfig(cwd);
    if (legacyOrmconfig) {
      candidates.push(legacyOrmconfig);
    }

    if (candidates.length === 0) {
      for (const file of DATA_SOURCE_FILE_CANDIDATES) {
        if (existsSync(resolve(cwd, file))) candidates.push(file);
      }
    }

    // No config file or folder convention for 0.3+ DataSource exports, so
    // fall back to scanning file contents, same as the Mongoose detector.
    if (candidates.length === 0) {
      candidates.push(
        ...findFilesByContent(cwd, looksLikeTypeOrmDataSourceSource),
      );
    }

    return {
      found: candidates.length > 0,
      candidates,
      confidence: confidenceFromCandidates(candidates),
    };
  },
};
