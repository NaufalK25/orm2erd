import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Detector } from "./types";

export const prismaDetector: Detector = {
  name: "prisma",

  async detect(cwd) {
    // See https://www.prisma.io/docs/orm/reference/prisma-config-reference#options-reference
    const nestedSchemaCandidate = join("prisma", "schema.prisma");
    const nestedSchemaFound = existsSync(join(cwd, nestedSchemaCandidate));

    const rootSchemaCandidate = "schema.prisma";
    const rootSchemaFound = existsSync(join(cwd, rootSchemaCandidate));

    const candidates = [
      ...(nestedSchemaFound ? [nestedSchemaCandidate] : []),
      ...(rootSchemaFound ? [rootSchemaCandidate] : []),
    ];

    return {
      found: candidates.length > 0,
      candidates,
      confidence: candidates.length === 1 ? 1 : candidates.length > 1 ? 0.5 : 0,
    };
  },
};
