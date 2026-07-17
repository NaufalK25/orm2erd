import type { Detector, DetectResult } from "./types";
import { prismaDetector } from "./prisma";
import { sequelizeDetector } from "./sequelize";
import { mongooseDetector } from "./mongoose";

export type { Detector, DetectResult } from "./types";

export const detectors: Detector[] = [
  prismaDetector,
  sequelizeDetector,
  mongooseDetector,
];

export interface DetectedORM extends DetectResult {
  name: Detector["name"];
}

export async function detectORMs(cwd: string): Promise<DetectedORM[]> {
  const results = await Promise.all(
    detectors.map(async (detector) => ({
      name: detector.name,
      ...(await detector.detect(cwd)),
    })),
  );
  return results.filter((result) => result.found);
}
