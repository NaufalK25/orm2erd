import { ERDModel } from "../core/model";
import type { ORMName } from "../core/orm";

export interface ResolvedEntry {
  path: string;
}

export interface ORMAdapter {
  name: ORMName;
  resolveEntry(input: string, cwd: string): Promise<ResolvedEntry>;
  extract(entry: ResolvedEntry): Promise<ERDModel>;
}
