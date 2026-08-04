import { pluralize, singularize } from "inflection";
import type { InflectMode } from "./format";

export function applyInflect(identifier: string, mode: InflectMode): string {
  if (mode === "preserve" || !identifier) return identifier;
  return mode === "plural" ? pluralize(identifier) : singularize(identifier);
}
