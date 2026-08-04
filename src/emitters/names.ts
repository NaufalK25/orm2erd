import type { Entity, ERDModel, Field } from "../core/model";
import type { CaseMode, NameMode } from "../core/format";
import { toCase } from "../core/case-transform";

/**
 * Resolves display identifiers for entities/fields under a `NameMode`, built
 * once per emit so every entity header and relation endpoint agrees on the
 * same identifier — `Relation.from`/`to` reference `Entity.name`, never the
 * resolved display form, so lookups always go through this resolver rather
 * than re-deriving the identifier inline.
 */
export interface NameResolver {
  /** The identifier to render/reference for this entity (its ERDModel `name` in "model" mode, else its table name). */
  entityId(name: string): string;
  /** The secondary label to show alongside `entityId` in "both" mode — undefined when not in "both" mode or there's nothing extra to show. */
  entityAlias(name: string): string | undefined;
  /** The identifier to render for this field (its `name` in "model" mode, else its column name). */
  fieldId(field: Field): string;
  /** The secondary label to show alongside `fieldId` in "both" mode — undefined when not in "both" mode or there's nothing extra to show. */
  fieldAlias(field: Field): string | undefined;
  /**
   * Resolves a field referenced by its model-level `name` rather than a
   * `Field` object — for `entity.primaryKey`/`entity.uniques`/`Index.fields`,
   * which the IR always keys by attribute name (see each adapter's
   * `extractCompositeKeys`-equivalent), never by physical column name.
   * Falls back to `fieldName` itself if the entity has no such field
   * (shouldn't happen — defensive only).
   */
  fieldIdByName(entity: Entity, fieldName: string): string;
  /**
   * Applies this resolver's `CaseMode` to an arbitrary identifier that isn't
   * tied to an entity/field lookup — e.g. a relation's association alias
   * (`Relation.fieldName`), which doesn't necessarily match any `Field.name`.
   * Callers that already have a `Field`/entity-name should go through
   * `entityId`/`fieldId`/`fieldIdByName` instead so name resolution and case
   * transformation happen together in one step.
   */
  applyCase(identifier: string): string;
}

/**
 * Builds a `Map<Entity.name, resolved identifier>` up front so a table-name
 * collision between two distinct models (e.g. both mapping to `tbl_customer`
 * via a bug or a legacy rename) can be detected across the whole model
 * instead of resolved independently per entity. On collision both entities
 * fall back to their model name and a warning is logged — silently merging
 * two distinct entities under one identifier would be worse than the
 * physical name this mode exists to surface.
 */
export function buildNameResolver(
  model: ERDModel,
  mode: NameMode,
  caseMode: CaseMode = "preserve",
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
          `orm2erd: entities "${priorClaimant}" and "${entity.name}" both map to table "${physical}" — keeping model names for both instead of merging them under one identifier.`,
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
    entityId: (name) => toCase(idFor.get(name) ?? name, caseMode),
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
