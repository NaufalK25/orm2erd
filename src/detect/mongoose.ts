import { dirname } from "node:path";
import type { Detector } from "./types";
import {
  confidenceFromCandidates,
  findFallbackModelDirs,
  findFilesByContent,
} from "./shared";
import { readPackageJson } from "../core/package";
import { looksLikeMongooseSchemaSource } from "../adapters/mongoose/schema-source";

// Mongoose has no config file or folder convention, so this content scan is
// the fallback of last resort.
function findMongooseSchemaDirs(cwd: string): string[] {
  const files = findFilesByContent(cwd, looksLikeMongooseSchemaSource);
  return Array.from(new Set(files.map((f) => dirname(f))));
}

export const mongooseDetector: Detector = {
  name: "mongoose",

  async detect(cwd) {
    const candidates: string[] = [];

    const packageJson = readPackageJson(cwd);
    if (!packageJson) {
      return { found: false, candidates, confidence: 0 };
    }

    const hasMongooseDep =
      Boolean(packageJson?.dependencies?.mongoose) ||
      Boolean(packageJson?.devDependencies?.mongoose);

    if (!hasMongooseDep) {
      return { found: false, candidates, confidence: 0 };
    }

    if (candidates.length === 0) {
      candidates.push(...findFallbackModelDirs(cwd));
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
      confidence: confidenceFromCandidates(candidates),
    };
  },
};
