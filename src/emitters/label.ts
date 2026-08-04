import type { ERDModel, Relation } from "../core/model";
import type { RelationLabelMode } from "../core/format";
import type { NameResolver } from "./names";

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

/**
 * `relationLabel` reads `fieldName`/`toColumn` straight off the raw
 * `Relation` — neither goes through `NameResolver`, so a `caseMode` other
 * than "preserve" would otherwise leave edge labels in their original
 * casing while every other identifier in the diagram changed underneath
 * them. `toColumn` is an attribute (model-level) name, resolved the same
 * way `fromColumn`/`primaryKey`/`uniques` members are (`fieldIdByName`);
 * `fieldName` is the relation's own association alias — it doesn't
 * necessarily match any field on either entity, so it's case-transformed
 * directly rather than looked up.
 */
export function resolveRelationLabel(
  model: ERDModel,
  rel: Relation,
  names: NameResolver,
  mode: RelationLabelMode = "both",
): string {
  const toEntity = model.entities.find((e) => e.name === rel.to);
  const fieldName = rel.fieldName
    ? names.applyCase(rel.fieldName)
    : rel.fieldName;
  const toColumn = rel.toColumn
    ? toEntity
      ? names.fieldIdByName(toEntity, rel.toColumn)
      : names.applyCase(rel.toColumn)
    : rel.toColumn;
  return relationLabel({ ...rel, fieldName, toColumn }, mode);
}
