import type { ORMName } from "../core/orm";

export interface DetectResult {
  found: boolean;
  /** Candidate entry paths the detector noticed (e.g. schema files, model dirs). */
  candidates: string[];
  /** 0-1; used to pick a default when multiple ORMs are detected. */
  confidence: number;
}

export interface Detector {
  name: ORMName;
  detect(cwd: string): Promise<DetectResult>;
}
