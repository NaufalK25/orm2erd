import { loadConfig } from "c12";
import { dirname, resolve } from "node:path";

interface PrismaConfigFile {
  schema?: string;
}

// Resolves prisma.config.*'s `schema` field, which takes priority over the
// zero-config defaults. Shared by the detector and the adapter's
// resolveEntry, since detection can be skipped via --orm + --entry.
export async function resolvePrismaConfigSchema(
  cwd: string,
): Promise<string | undefined> {
  try {
    const { config, configFile } = await loadConfig<PrismaConfigFile>({
      name: "prisma",
      cwd,
    });
    if (config?.schema && configFile) {
      return resolve(dirname(configFile), config.schema);
    }
  } catch {
    // Broken prisma.config.* — treat as if none was found.
  }
  return undefined;
}
