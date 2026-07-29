import type { Relation } from "../core/model";

/**
 * Two relations sharing the same alias but different FK columns (e.g. two
 * FKs from the same entity pair) otherwise render identical edge labels.
 * Appending the column disambiguates them without touching the alias itself.
 */
export function relationLabel(rel: Relation): string {
  const { fieldName, toColumn } = rel;
  if (fieldName && toColumn && fieldName !== toColumn) {
    return `${fieldName} (${toColumn})`;
  }
  return fieldName ?? toColumn ?? "";
}
