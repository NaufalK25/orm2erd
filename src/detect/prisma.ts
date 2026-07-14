import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Detector } from "./types";

export const prismaDetector: Detector = {
  name: "prisma",

  async detect(cwd) {
    const singleSchemaCandidate = join("prisma", "schema.prisma");
    const singleSchemaFound = existsSync(join(cwd, singleSchemaCandidate));

    const multipleSchemasCandidate = join("prisma", "schema");
    const multipleSchemasFound =
      existsSync(join(cwd, multipleSchemasCandidate)) &&
      statSync(join(cwd, multipleSchemasCandidate)).isDirectory();

    const candidates = [
      ...(singleSchemaFound ? [singleSchemaCandidate] : []),
      ...(multipleSchemasFound ? [multipleSchemasCandidate] : []),
    ];

    return {
      found: candidates.length > 0,
      candidates,
      confidence: candidates.length === 1 ? 1 : candidates.length > 1 ? 0.5 : 0,
    };
  },
};
