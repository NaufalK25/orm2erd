import type { ERDModel, Relation } from "../core/model";
import type { RelationLabelMode } from "../core/format";
import type { NameResolver } from "./names";

/**
 * Edge label for a relation. In "both" mode the FK column is appended when it
 * differs from the alias, so two FKs between the same pair don't render
 * identical labels; "alias"/"column" pin it to one.
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
 * `relationLabel` with --case applied. `toColumn` is an attribute name, so it
 * resolves like other field references; the `fieldName` alias may match no
 * field, so it's case-transformed directly.
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
