import type { Entity, Field } from "../core/model";

/**
 * The other columns in the composite unique group `field` belongs to (per
 * `entity.uniques`), or `undefined` if it isn't part of one. A field can be
 * unique two different ways — its own `isUnique` (single-column) or
 * membership in one of `entity.uniques`' multi-column groups — and callers
 * need both the "is it unique at all" signal and the group's other members
 * to disambiguate it from an independent single-column unique.
 */
export function compositeUniqueMates(
  entity: Entity,
  field: Field,
): string[] | undefined {
  const group = (entity.uniques ?? []).find((g) => g.includes(field.name));
  return group?.filter((f) => f !== field.name);
}
