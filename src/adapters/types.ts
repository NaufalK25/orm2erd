import { ERDModel } from "../core/model";
import type { ORMName } from "../core/orm";

export interface ResolvedEntry {
  path: string;
}

export interface ORMAdapter {
  name: ORMName;
  /** Validates/normalizes the user-supplied entry (schema path or model dir) into a `ResolvedEntry`. */
  resolveEntry(input: string, cwd: string): Promise<ResolvedEntry>;
  /** Parses or runtime-introspects the resolved entry into the normalized `ERDModel` IR. */
  extract(entry: ResolvedEntry): Promise<ERDModel>;
}
