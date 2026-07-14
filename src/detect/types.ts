import type { ORMName } from "../core/orm";

export interface DetectResult {
  found: boolean;
  candidates: string[];
  confidence: number;
}

export interface Detector {
  name: ORMName;
  detect(cwd: string): Promise<DetectResult>;
}
