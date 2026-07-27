import type { Detector, DetectResult } from "./types";
import { prismaDetector } from "./prisma";
import { sequelizeDetector } from "./sequelize";
import { mongooseDetector } from "./mongoose";
import { typeormDetector } from "./typeorm";
import { drizzleDetector } from "./drizzle";

export type { Detector, DetectResult } from "./types";

export const detectors: Detector[] = [
  prismaDetector,
  sequelizeDetector,
  mongooseDetector,
  typeormDetector,
  drizzleDetector,
];

export interface DetectedORM extends DetectResult {
  name: Detector["name"];
}

/** Runs every built-in detector against `cwd` and returns only the ORMs it found. */
export async function detectORMs(cwd: string): Promise<DetectedORM[]> {
  const results = await Promise.all(
    detectors.map(async (detector) => ({
      name: detector.name,
      ...(await detector.detect(cwd)),
    })),
  );
  return results.filter((result) => result.found);
}
