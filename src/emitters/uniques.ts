import type { Entity, Field } from "../core/model";

/**
 * The other members of `field`'s composite unique group, or `undefined` if it
 * has none. Lets emitters tell a composite-unique member apart from a
 * single-column `isUnique`.
 */
export function compositeUniqueMates(
  entity: Entity,
  field: Field,
): string[] | undefined {
  const group = (entity.uniques ?? []).find((g) => g.includes(field.name));
  return group?.filter((f) => f !== field.name);
}
