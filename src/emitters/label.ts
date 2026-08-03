import type { Relation } from "../core/model";
import type { RelationLabelMode } from "../core/format";

/**
 * Two relations sharing the same alias but different FK columns (e.g. two
 * FKs from the same entity pair) otherwise render identical edge labels.
 * Appending the column disambiguates them without touching the alias itself.
 * `mode` lets a caller opt out of that disambiguation and pin the label to
 * just the alias or just the column; defaults to the smart "both" behavior
 * described above.
 */
export function relationLabel(
  rel: Relation,
  mode: RelationLabelMode = "both",
): string {
  const { fieldName, toColumn } = rel;
  if (mode === "alias") return fieldName ?? toColumn ?? "";
  if (mode === "column") return toColumn ?? fieldName ?? "";
  if (fieldName && toColumn && fieldName !== toColumn) {
    return `${fieldName} (${toColumn})`;
  }
  return fieldName ?? toColumn ?? "";
}
