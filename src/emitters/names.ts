import type { Entity, ERDModel, Field } from "../core/model";
import type { CaseMode, InflectMode, NameMode } from "../core/format";
import { toCase } from "../core/case-transform";
import { applyInflect } from "../core/inflect";

/**
 * Resolves display identifiers for entities/fields under a `NameMode`, built
 * once per emit so every entity header and relation endpoint agrees on the
 * same identifier: `Relation.from`/`to` reference `Entity.name`, never the
 * resolved display form, so lookups always go through this resolver rather
 * than re-deriving the identifier inline.
 */
export interface NameResolver {
  /** The identifier to render/reference for this entity (its ERDModel `name` in "model" mode, else its table name): inflected, then case-transformed. */
  entityId(name: string): string;
  /** The secondary label to show alongside `entityId` in "both" mode: undefined when not in "both" mode or there's nothing extra to show. */
  entityAlias(name: string): string | undefined;
  /** The identifier to render for this field (its `name` in "model" mode, else its column name). */
  fieldId(field: Field): string;
  /** The secondary label to show alongside `fieldId` in "both" mode: undefined when not in "both" mode or there's nothing extra to show. */
  fieldAlias(field: Field): string | undefined;
  /**
   * For `primaryKey`/`uniques`/`Index.fields`, which the IR keys by attribute
   * name. Falls back to `fieldName` if the entity has no such field.
   */
  fieldIdByName(entity: Entity, fieldName: string): string;
  /**
   * Applies the `CaseMode` to an identifier with no field behind it, e.g. a
   * relation alias. Prefer `entityId`/`fieldId`/`fieldIdByName` when you have one.
   */
  applyCase(identifier: string): string;
}

/**
 * Resolves every entity id up front so two models mapping to the same table
 * are caught: both then keep their model names and a warning is logged,
 * rather than merging into one identifier.
 */
export function buildNameResolver(
  model: ERDModel,
  mode: NameMode,
  caseMode: CaseMode = "preserve",
  inflectMode: InflectMode = "preserve",
): NameResolver {
  const idFor = new Map<string, string>();

  if (mode === "model") {
    for (const entity of model.entities) idFor.set(entity.name, entity.name);
  } else {
    const claimedBy = new Map<string, string>();
    for (const entity of model.entities) {
      const physical = entity.tableName ?? entity.name;
      const priorClaimant = claimedBy.get(physical);
      if (priorClaimant && priorClaimant !== entity.name) {
        console.error(
          `orm2erd: entities "${priorClaimant}" and "${entity.name}" both map to table "${physical}". Keeping model names for both instead of merging them under one identifier.`,
        );
        idFor.set(entity.name, entity.name);
        idFor.set(priorClaimant, priorClaimant);
        continue;
      }
      claimedBy.set(physical, entity.name);
      idFor.set(entity.name, physical);
    }
  }

  return {
    entityId: (name) =>
      toCase(applyInflect(idFor.get(name) ?? name, inflectMode), caseMode),
    entityAlias: (name) => {
      if (mode !== "both") return undefined;
      const id = idFor.get(name) ?? name;
      return id !== name ? name : undefined;
    },
    fieldId: (field) =>
      toCase(
        mode === "model" ? field.name : (field.columnName ?? field.name),
        caseMode,
      ),
    fieldAlias: (field) => {
      if (mode !== "both") return undefined;
      return field.columnName && field.columnName !== field.name
        ? field.name
        : undefined;
    },
    fieldIdByName: (entity, fieldName) => {
      const field = entity.fields.find((f) => f.name === fieldName);
      if (!field) return toCase(fieldName, caseMode);
      return toCase(
        mode === "model" ? field.name : (field.columnName ?? field.name),
        caseMode,
      );
    },
    applyCase: (identifier) => toCase(identifier, caseMode),
  };
}
