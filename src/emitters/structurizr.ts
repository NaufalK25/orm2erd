import type { Entity, Field } from "../core/model";
import type { Emitter } from "./types";
import { resolveRelationLabel } from "./label";
import { buildNameResolver } from "./names";
import type { NameResolver } from "./names";
import type { TypeMode } from "../core/format";

// Structurizr has no native "table with columns" shape — this maps ERDModel
// onto the DSL's generic `element` keyword (custom elements outside the C4
// model) plus `properties` for structured per-column metadata. See
// docs/samples/structurizr-erd-reference.dsl for the full worked example
// this mapping is based on (verified against
// https://docs.structurizr.com/dsl/language).

// The `x = element ...` variable on the left of a declaration is a bare DSL
// token, not a quoted string — unlike every other value this emitter emits
// (the element's own name/description/tag args, property keys/values),
// which are quoted strings and tolerate arbitrary characters. Keywords
// verified against https://docs.structurizr.com/dsl/language.
const RESERVED_IDENTIFIERS = new Set([
  "workspace",
  "model",
  "views",
  "styles",
  "group",
  "element",
  "properties",
  "relationship",
  "tags",
  "perspectives",
  "url",
  "include",
  "exclude",
  "autolayout",
  "theme",
  "themes",
  "branding",
  "terminology",
  "configuration",
  "person",
  "softwaresystem",
  "container",
  "component",
  "deploymentenvironment",
  "deploymentnode",
  "infrastructurenode",
  "softwaresysteminstance",
  "containerinstance",
  "animation",
  "custom",
  "identifiers",
  "default",
]);

/**
 * DSL identifiers are always derived from `Entity.name` (the ORM model
 * name) — never `nameMode`/`caseMode` — since this is only an internal
 * reference token used to wire up relationships, not something displayed.
 * Case-insensitive collisions (sanitization collapsing two distinct names,
 * or a clash with a reserved keyword) are deduped with a numeric suffix.
 */
function buildDslIdentifiers(entities: Entity[]): Map<string, string> {
  const used = new Set<string>();
  const idFor = new Map<string, string>();
  for (const entity of entities) {
    let base = entity.name.replace(/[^A-Za-z0-9_]/g, "_");
    if (/^[0-9]/.test(base)) base = `_${base}`;
    if (base.length === 0) base = "_entity";
    let candidate = base;
    let suffix = 1;
    while (
      used.has(candidate.toLowerCase()) ||
      RESERVED_IDENTIFIERS.has(candidate.toLowerCase())
    ) {
      candidate = `${base}_${suffix++}`;
    }
    used.add(candidate.toLowerCase());
    idFor.set(entity.name, candidate);
  }
  return idFor;
}

function quoteStr(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function fieldTypeLabel(field: Field, typeMode: TypeMode): string {
  let displayType = typeMode === "native" ? field.nativeType : field.type;
  if (field.type === "enum") {
    displayType = `enum(${field.enumValues?.join(", ")})`;
  }
  return `${displayType}${field.isList ? "[]" : ""}`;
}

/**
 * The free-text value of a `"column.<name>"` property — everything Mermaid
 * would otherwise split across separate type/constraint/comment cells,
 * folded into one string since Structurizr properties are flat key/value
 * pairs. Native type is only appended when it's not already the primary
 * label (typeMode "canonical") to avoid showing the same value twice.
 */
function columnPropertyValue(
  field: Field,
  typeMode: TypeMode,
  fieldAlias: string | undefined,
): string {
  const typeLabel = fieldTypeLabel(field, typeMode);
  const constraints = [
    field.isPrimaryKey && "PK",
    field.isForeignKey && "FK",
    field.isUnique && "UNIQUE",
  ].filter((c): c is string => Boolean(c));
  const segments = [
    typeLabel,
    ...constraints,
    field.isNullable ? "NULL" : "NOT NULL",
  ];
  if (field.defaultValue) {
    segments.push(`DEFAULT ${field.defaultValue.replaceAll('"', "'")}`);
  }
  let value = segments.join(", ");
  if (typeMode !== "native") value += ` (native: ${field.nativeType})`;
  if (fieldAlias) value += ` — alias: ${fieldAlias}`;
  if (field.description) value += ` — ${field.description}`;
  return value;
}

/**
 * Builds the ordered `"key" "value"` property pairs for one entity: an
 * (aliasing) `model` name, composite PK/uniques/indexes — mirroring what
 * DBML puts in its `indexes` block, single-column PK/unique stay on the
 * per-column line instead — then one `column.<physical name>` entry per
 * field. Column keys are always the physical column name regardless of
 * `nameMode`, so they stay a stable lookup key independent of display
 * preference; the resolved display name still shows up in the value as
 * `alias: ...` under `--names both`.
 */
function entityProperties(
  entity: Entity,
  typeMode: TypeMode,
  names: NameResolver,
): [string, string][] {
  const properties: [string, string][] = [];

  const entityAlias = names.entityAlias(entity.name);
  if (entityAlias) properties.push(["model", entityAlias]);

  if (entity.primaryKey) {
    properties.push([
      "primaryKey",
      entity.primaryKey.map((f) => names.fieldIdByName(entity, f)).join(", "),
    ]);
  }

  (entity.uniques ?? []).forEach((group, i) => {
    properties.push([
      `unique.${i + 1}`,
      group.map((f) => names.fieldIdByName(entity, f)).join(", "),
    ]);
  });

  for (const field of entity.fields) {
    const key = names.applyCase(field.columnName ?? field.name);
    properties.push([
      `column.${key}`,
      columnPropertyValue(field, typeMode, names.fieldAlias(field)),
    ]);
  }

  (entity.indexes ?? []).forEach((idx, i) => {
    // idx.name is a physical index name, not an entity/field/enum-type
    // identifier — caseMode never touches it (see DBML's `name:` handling,
    // which likewise leaves it as-is).
    const key = idx.name ? `index.${idx.name}` : `index.${i + 1}`;
    const cols = idx.fields
      .map((f) => names.fieldIdByName(entity, f))
      .join(", ");
    properties.push([key, idx.isUnique ? `${cols} [unique]` : cols]);
  });

  return properties;
}

export const structurizrEmitter: Emitter = {
  format: "structurizr",
  fileExtension: "dsl",
  emit(model, options) {
    const {
      typeMode,
      nameMode = "model",
      relationLabelMode = "both",
      caseMode = "preserve",
      inflectMode = "preserve",
    } = options;
    const names = buildNameResolver(model, nameMode, caseMode, inflectMode);
    const dslIds = buildDslIdentifiers(model.entities);

    const lines = [
      "// Generated by orm2erd.",
      "",
      'workspace "ERD" {',
      "",
      "    model {",
      "        // Entities",
    ];

    for (const entity of model.entities) {
      const dslId = dslIds.get(entity.name);
      if (!dslId) continue;
      const entityId = names.entityId(entity.name);
      lines.push(
        `        ${dslId} = element ${quoteStr(entityId)} ${quoteStr("Table")} ${quoteStr(entity.description ?? "")} ${quoteStr("Entity")} {`,
        "            properties {",
      );
      for (const [key, value] of entityProperties(entity, typeMode, names)) {
        lines.push(`                ${quoteStr(key)} ${quoteStr(value)}`);
      }
      lines.push("            }", "        }", "");
    }

    lines.push("        // Relationships");
    for (const rel of model.relations) {
      const fromDsl = dslIds.get(rel.from);
      const toDsl = dslIds.get(rel.to);
      if (!fromDsl || !toDsl) continue;

      const resolvedLabel = resolveRelationLabel(
        model,
        rel,
        names,
        relationLabelMode,
      );
      const description = resolvedLabel
        ? `${rel.type} · ${resolvedLabel}`
        : rel.type;

      let technology: string;
      if (rel.fromColumn && rel.toColumn) {
        const fromEntity = model.entities.find((e) => e.name === rel.from);
        const toEntity = model.entities.find((e) => e.name === rel.to);
        const fromColumnId = fromEntity
          ? names.fieldIdByName(fromEntity, rel.fromColumn)
          : rel.fromColumn;
        const toColumnId = toEntity
          ? names.fieldIdByName(toEntity, rel.toColumn)
          : rel.toColumn;
        const actions = [
          rel.onDelete && `onDelete: ${rel.onDelete}`,
          rel.onUpdate && `onUpdate: ${rel.onUpdate}`,
        ].filter((a): a is string => Boolean(a));
        technology = `FK ${names.entityId(rel.to)}.${toColumnId} -> ${names.entityId(rel.from)}.${fromColumnId}${actions.length > 0 ? " · " + actions.join(" · ") : ""}`;
      } else {
        // Unresolvable FK columns — e.g. an implicit many-to-many join
        // table isn't a modeled entity — so there's no real column to
        // point at, unlike D2/DBML/GraphvizDOT this relation still renders
        // (Structurizr connects whole elements, not column ports).
        technology =
          rel.type === "n-n"
            ? "many-to-many via an implicit join table (columns not modeled)"
            : "columns not modeled";
      }

      const cardinalityTag =
        rel.type === "1-1"
          ? "OneToOne"
          : rel.type === "1-n"
            ? "OneToMany"
            : "ManyToMany";
      const tags =
        rel.from === rel.to
          ? `${cardinalityTag},SelfReferential`
          : cardinalityTag;

      lines.push(
        `        ${fromDsl} -> ${toDsl} ${quoteStr(description)} ${quoteStr(technology)} {`,
        `            tags ${quoteStr(tags)}`,
        "        }",
      );
    }

    lines.push(
      "    }",
      "",
      "    views {",
      '        custom "ERD" "ERD" "All entities and relationships." {',
      "            include *",
      "            autoLayout lr",
      "        }",
      "",
      "        styles {",
      '            element "Entity" {',
      "                shape Box",
      "                background #F5F5F5",
      "                color #1A1A1A",
      "                border solid",
      "            }",
      '            relationship "OneToOne" {',
      "                color #2E7D32",
      "                style solid",
      "                routing Orthogonal",
      "            }",
      '            relationship "OneToMany" {',
      "                color #1565C0",
      "                style solid",
      "                routing Orthogonal",
      "            }",
      '            relationship "ManyToMany" {',
      "                color #AD1457",
      "                style dashed",
      "                routing Curved",
      "            }",
      '            relationship "SelfReferential" {',
      "                routing Curved",
      "            }",
      "        }",
      "    }",
      "}",
    );

    return lines.join("\n");
  },
};
