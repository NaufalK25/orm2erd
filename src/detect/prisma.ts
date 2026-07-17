import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import type { Detector } from "./types";
import { confidenceFromCandidates } from "./shared";
import { resolvePrismaConfigSchema } from "../adapters/prisma/config";

export const prismaDetector: Detector = {
  name: "prisma",

  async detect(cwd) {
    // See https://www.prisma.io/docs/orm/reference/prisma-config-reference#options-reference
    const nestedSchemaCandidate = join("prisma", "schema.prisma");
    const rootSchemaCandidate = "schema.prisma";

    const nestedSchemaFound = existsSync(join(cwd, nestedSchemaCandidate));
    const rootSchemaFound = existsSync(join(cwd, rootSchemaCandidate));

    const defaultCandidates = [
      ...(nestedSchemaFound ? [nestedSchemaCandidate] : []),
      ...(rootSchemaFound ? [rootSchemaCandidate] : []),
    ];

    const configSchema = await resolvePrismaConfigSchema(cwd);
    const configCandidate = configSchema
      ? relative(cwd, configSchema)
      : undefined;

    // Config wins by default (it's what Prisma itself would actually use),
    // but a default file left on disk alongside it is still a real,
    // pickable schema — surface both instead of hiding one.
    const candidates = configCandidate
      ? [
          configCandidate,
          ...defaultCandidates.filter((c) => c !== configCandidate),
        ]
      : defaultCandidates;

    return {
      found: candidates.length > 0,
      candidates,
      confidence: confidenceFromCandidates(candidates),
    };
  },
};
