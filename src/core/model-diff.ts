import { readFile, writeFile } from "node:fs/promises";
import type { Entity, ERDModel, Field, Relation } from "./model";

export const MODEL_SNAPSHOT_VERSION = 1;

export interface ModelSnapshot {
  version: number;
  model: ERDModel;
}

export function modelSnapshotPath(outBase: string): string {
  return `${outBase}.orm2erd-model.json`;
}

// Any failure (missing file, bad JSON, version mismatch) collapses to null so
// the caller falls back to the text diff — a soft-degrade case, not
// correctness-critical the way checkOutput's ENOENT-only/rethrow-others
// handling is for the diagram files themselves.
export async function readModelSnapshot(
  path: string,
): Promise<ERDModel | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch {
    return null;
  }
  try {
    const snapshot = JSON.parse(raw) as Partial<ModelSnapshot>;
    if (snapshot.version !== MODEL_SNAPSHOT_VERSION || !snapshot.model) {
      return null;
    }
    return snapshot.model;
  } catch {
    return null;
  }
}

export async function writeModelSnapshot(
  path: string,
  model: ERDModel,
): Promise<void> {
  const snapshot: ModelSnapshot = { version: MODEL_SNAPSHOT_VERSION, model };
  await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, "utf-8");
}

// Structural/DDL-relevant field properties only. `description` is
// deliberately excluded — it's a free-text doc comment (Prisma `///`,
// Sequelize/TypeORM `comment`), not a schema fact, and including it would
// reintroduce the "wall of noise for a cosmetic edit" problem --summary
// exists to fix.
const FIELD_DIFF_PROPS = [
  "type",
  "nativeType",
  "columnName",
  "isNullable",
  "isForeignKey",
  "isPrimaryKey",
  "isUnique",
  "isList",
  "defaultValue",
  "enumValues",
] as const satisfies readonly (keyof Field)[];

const RELATION_DIFF_PROPS = [
  "type",
  "onDelete",
  "onUpdate",
  "isFromOptional",
] as const satisfies readonly (keyof Relation)[];

export interface PropertyChange {
  property: string;
  before: unknown;
  after: unknown;
}

export interface FieldChange {
  field: string;
  changes: PropertyChange[];
}

export interface EntityDiff {
  entity: string;
  status: "added" | "removed" | "changed";
  tableNameChange?: { before?: string; after?: string };
  addedFields: string[];
  removedFields: string[];
  changedFields: FieldChange[];
}

export interface RelationDiff {
  from: string;
  to: string;
  fieldName?: string;
  status: "added" | "removed" | "changed";
  changes?: PropertyChange[];
}

export interface ModelDiff {
  entities: EntityDiff[];
  relations: RelationDiff[];
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

function diffFields(before: Field, after: Field): PropertyChange[] {
  const changes: PropertyChange[] = [];
  for (const prop of FIELD_DIFF_PROPS) {
    const beforeValue = before[prop];
    const afterValue = after[prop];
    if (!valuesEqual(beforeValue, afterValue)) {
      changes.push({ property: prop, before: beforeValue, after: afterValue });
    }
  }
  return changes;
}

function diffEntities(before: Entity, after: Entity): EntityDiff {
  const beforeFields = new Map(before.fields.map((f) => [f.name, f]));
  const afterFields = new Map(after.fields.map((f) => [f.name, f]));

  const addedFields = [...afterFields.keys()].filter(
    (name) => !beforeFields.has(name),
  );
  const removedFields = [...beforeFields.keys()].filter(
    (name) => !afterFields.has(name),
  );
  const changedFields: FieldChange[] = [];
  for (const [name, afterField] of afterFields) {
    const beforeField = beforeFields.get(name);
    if (!beforeField) continue;
    const changes = diffFields(beforeField, afterField);
    if (changes.length > 0) {
      changedFields.push({ field: name, changes });
    }
  }

  const tableNameChange =
    before.tableName !== after.tableName
      ? { before: before.tableName, after: after.tableName }
      : undefined;

  return {
    entity: after.name,
    status: "changed",
    tableNameChange,
    addedFields,
    removedFields,
    changedFields,
  };
}

function entityDiffIsEmpty(diff: EntityDiff): boolean {
  return (
    diff.status !== "added" &&
    diff.status !== "removed" &&
    !diff.tableNameChange &&
    diff.addedFields.length === 0 &&
    diff.removedFields.length === 0 &&
    diff.changedFields.length === 0
  );
}

function diffEntityLists(before: Entity[], after: Entity[]): EntityDiff[] {
  const beforeByName = new Map(before.map((e) => [e.name, e]));
  const afterByName = new Map(after.map((e) => [e.name, e]));
  const diffs: EntityDiff[] = [];

  for (const entity of after) {
    const prior = beforeByName.get(entity.name);
    if (!prior) {
      diffs.push({
        entity: entity.name,
        status: "added",
        addedFields: entity.fields.map((f) => f.name),
        removedFields: [],
        changedFields: [],
      });
      continue;
    }
    const diff = diffEntities(prior, entity);
    if (!entityDiffIsEmpty(diff)) {
      diffs.push(diff);
    }
  }

  for (const entity of before) {
    if (!afterByName.has(entity.name)) {
      diffs.push({
        entity: entity.name,
        status: "removed",
        addedFields: [],
        removedFields: entity.fields.map((f) => f.name),
        changedFields: [],
      });
    }
  }

  return diffs;
}

// Relations have no stable name field, so they're matched within each
// (from, to) group via a two-tier identity: FK columns first (the most
// physically stable signal — survives a fieldName rename), then fieldName,
// then whatever's left pairs positionally as a last resort.
function relationIdentity(rel: Relation): string | undefined {
  if (rel.fromColumn && rel.toColumn) {
    return `col:${rel.fromColumn}>${rel.toColumn}`;
  }
  if (rel.fieldName) {
    return `field:${rel.fieldName}`;
  }
  return undefined;
}

interface RelationPair {
  before: Relation;
  after: Relation;
}

function matchRelationGroup(
  before: Relation[],
  after: Relation[],
): { pairs: RelationPair[]; removed: Relation[]; added: Relation[] } {
  const pairs: RelationPair[] = [];
  const remainingBefore = [...before];
  const remainingAfter = [...after];

  for (let i = remainingBefore.length - 1; i >= 0; i--) {
    const identity = relationIdentity(remainingBefore[i]);
    if (!identity) continue;
    const j = remainingAfter.findIndex(
      (rel) => relationIdentity(rel) === identity,
    );
    if (j === -1) continue;
    pairs.push({ before: remainingBefore[i], after: remainingAfter[j] });
    remainingBefore.splice(i, 1);
    remainingAfter.splice(j, 1);
  }

  // Positional fallback for whatever's left (typically both sides lacking
  // any identity signal at all — best-effort, order-dependent).
  const positionalCount = Math.min(
    remainingBefore.length,
    remainingAfter.length,
  );
  for (let i = 0; i < positionalCount; i++) {
    pairs.push({ before: remainingBefore[i], after: remainingAfter[i] });
  }

  return {
    pairs,
    removed: remainingBefore.slice(positionalCount),
    added: remainingAfter.slice(positionalCount),
  };
}

function relationGroupKey(rel: Relation): string {
  return `${rel.from} ${rel.to}`;
}

function diffRelationLists(
  before: Relation[],
  after: Relation[],
): RelationDiff[] {
  const beforeGroups = new Map<string, Relation[]>();
  const afterGroups = new Map<string, Relation[]>();
  for (const rel of before) {
    const key = relationGroupKey(rel);
    const group = beforeGroups.get(key) ?? [];
    group.push(rel);
    beforeGroups.set(key, group);
  }
  for (const rel of after) {
    const key = relationGroupKey(rel);
    const group = afterGroups.get(key) ?? [];
    group.push(rel);
    afterGroups.set(key, group);
  }

  const diffs: RelationDiff[] = [];
  const allKeys = new Set([...beforeGroups.keys(), ...afterGroups.keys()]);

  for (const key of allKeys) {
    const { pairs, removed, added } = matchRelationGroup(
      beforeGroups.get(key) ?? [],
      afterGroups.get(key) ?? [],
    );

    for (const { before: priorRel, after: rel } of pairs) {
      const changes: PropertyChange[] = [];
      for (const prop of RELATION_DIFF_PROPS) {
        const beforeValue = priorRel[prop];
        const afterValue = rel[prop];
        if (!valuesEqual(beforeValue, afterValue)) {
          changes.push({
            property: prop,
            before: beforeValue,
            after: afterValue,
          });
        }
      }
      if (changes.length > 0) {
        diffs.push({
          from: rel.from,
          to: rel.to,
          fieldName: rel.fieldName,
          status: "changed",
          changes,
        });
      }
    }

    for (const rel of added) {
      diffs.push({
        from: rel.from,
        to: rel.to,
        fieldName: rel.fieldName,
        status: "added",
      });
    }
    for (const rel of removed) {
      diffs.push({
        from: rel.from,
        to: rel.to,
        fieldName: rel.fieldName,
        status: "removed",
      });
    }
  }

  return diffs;
}

export function diffModel(before: ERDModel, after: ERDModel): ModelDiff {
  return {
    entities: diffEntityLists(before.entities, after.entities),
    relations: diffRelationLists(before.relations, after.relations),
  };
}

export function isModelDiffEmpty(diff: ModelDiff): boolean {
  return diff.entities.length === 0 && diff.relations.length === 0;
}

function formatValue(value: unknown): string {
  if (value === undefined) return "(none)";
  if (Array.isArray(value)) return `[${value.join(", ")}]`;
  if (typeof value === "string") return `"${value}"`;
  return String(value);
}

function formatPropertyChanges(changes: PropertyChange[]): string {
  return changes
    .map(
      (c) =>
        `${c.property} (${formatValue(c.before)} → ${formatValue(c.after)})`,
    )
    .join(", ");
}

export function formatModelDiff(diff: ModelDiff): string[] {
  const lines: string[] = [];

  for (const entity of diff.entities) {
    if (entity.status === "added") {
      lines.push(`${entity.entity}: added (new entity)`);
      continue;
    }
    if (entity.status === "removed") {
      lines.push(`${entity.entity}: removed`);
      continue;
    }
    if (entity.tableNameChange) {
      lines.push(
        `${entity.entity}: table renamed (${entity.tableNameChange.before ?? entity.entity} → ${entity.tableNameChange.after ?? entity.entity})`,
      );
    }
    for (const field of entity.addedFields) {
      lines.push(`${entity.entity}: +column "${field}"`);
    }
    for (const field of entity.removedFields) {
      lines.push(`${entity.entity}: -column "${field}"`);
    }
    for (const change of entity.changedFields) {
      lines.push(
        `${entity.entity}.${change.field}: ${formatPropertyChanges(change.changes)}`,
      );
    }
  }

  for (const rel of diff.relations) {
    if (rel.status === "added") {
      lines.push(`${rel.from} → ${rel.to}: relation added`);
      continue;
    }
    if (rel.status === "removed") {
      lines.push(`${rel.from} → ${rel.to}: relation removed`);
      continue;
    }
    const cardinalityChange = rel.changes?.find((c) => c.property === "type");
    if (cardinalityChange) {
      lines.push(
        `${rel.from} → ${rel.to}: cardinality changed (${cardinalityChange.before} → ${cardinalityChange.after})`,
      );
    }
    const otherChanges = (rel.changes ?? []).filter(
      (c) => c.property !== "type",
    );
    if (otherChanges.length > 0) {
      lines.push(
        `${rel.from} → ${rel.to}: ${formatPropertyChanges(otherChanges)}`,
      );
    }
  }

  return lines;
}
