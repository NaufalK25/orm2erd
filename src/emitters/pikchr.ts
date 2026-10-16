import type { Entity, ERDModel, Field, Relation } from "../core/model";
import type { Emitter } from "./types";
import { resolveRelationLabel } from "./label";
import { buildNameResolver } from "./names";
import type { RelationLabelMode, TypeMode } from "../core/format";

// Pikchr has no table primitive, grouping, or auto-layout, and caps an object
// at 5 text terms, so each entity is a field container plus a background box,
// placed by explicit coordinates. Syntax rules come from the validated sample
// in docs/samples/pikchr-erd-reference.pikchr: object labels need a capital
// initial, `x = ...` variables a lowercase one, and `at (x,y)` goes after
// `to`/`behind` but before `width`/`height`.

// Pikchr's string-literal escaping rules aren't documented clearly enough to
// rely on; substituting a straight quote for an apostrophe (same approach as
// structurizr.ts/d2.ts/mermaid.ts) avoids needing to guess at backslash
// escapes for text that's never syntactically load-bearing.
function s(value: string): string {
  return value.replaceAll('"', "'");
}

function fmt(inches: number): string {
  return inches.toFixed(2);
}

/**
 * Both the field container and its background box live in one shared
 * identifier namespace (`Name`/`NameFields`): object labels require a
 * capital initial (the grammar reserves lowercase-initial bare tokens for
 * `x = value` variables), so a sanitized/capitalized name is minted once and
 * deduped case-insensitively against every other entity's pair of names.
 */
function buildPikchrIds(
  entities: Entity[],
): Map<string, { boxId: string; fieldsId: string }> {
  const used = new Set<string>();
  const result = new Map<string, { boxId: string; fieldsId: string }>();
  for (const entity of entities) {
    let base = entity.name.replace(/[^A-Za-z0-9_]/g, "_");
    if (base.length === 0) base = "Entity";
    if (!/^[A-Za-z]/.test(base)) base = `E${base}`;
    base = base[0].toUpperCase() + base.slice(1);
    let candidate = base;
    let suffix = 1;
    while (
      used.has(candidate.toLowerCase()) ||
      used.has(`${candidate}fields`.toLowerCase())
    ) {
      candidate = `${base}_${suffix++}`;
    }
    used.add(candidate.toLowerCase());
    used.add(`${candidate}fields`.toLowerCase());
    result.set(entity.name, {
      boxId: candidate,
      fieldsId: `${candidate}Fields`,
    });
  }
  return result;
}

function markerFor(field: Field): string {
  return [
    field.isPrimaryKey && "PK",
    field.isForeignKey && "FK",
    field.isUnique && "UQ",
  ]
    .filter((c): c is string => Boolean(c))
    .join(",");
}

// Canonical mode shows the bare word "enum" in the type column: enum
// members are appended as a "[a|b|c]" suffix on the line instead (see
// restFor below), matching the reference sample rather than structurizr's
// inline "enum(a, b)": Pikchr's field line is already the widest column so
// keeping the type cell short helps padding stay sane.
function typeLabelFor(field: Field, typeMode: TypeMode): string {
  const base =
    typeMode === "native"
      ? field.nativeType
      : field.type === "enum"
        ? "enum"
        : field.type;
  return `${base}${field.isList ? "[]" : ""}`;
}

function restFor(
  field: Field,
  typeMode: TypeMode,
  fieldAlias: string | undefined,
): string {
  let rest = field.isNullable ? "NULL" : "NOT NULL";
  if (field.defaultValue)
    rest += ` DEFAULT ${s(field.defaultValue.replaceAll('"', "'"))}`;
  if (typeMode !== "native") rest += ` (${s(field.nativeType)})`;
  if (field.enumValues && field.enumValues.length > 0) {
    rest += ` [${field.enumValues.map(s).join("|")}]`;
  }
  if (fieldAlias) rest += ` · alias: ${s(fieldAlias)}`;
  if (field.description) rest += ` · ${s(field.description)}`;
  return rest;
}

type LineKind = "header" | "italic" | "mono" | "rule";
interface RenderLine {
  text: string;
  style: string;
  kind: LineKind;
}

// Size estimates for grid spacing only (emitted widths come from the real
// container). ~0.055in/char measured from the reference render, rounded up:
// overestimating only adds whitespace, underestimating overlaps boxes.
const CHAR_W: Record<LineKind, number> = {
  header: 0.1,
  italic: 0.05,
  mono: 0.068,
  rule: 0.045,
};
const LINE_H: Record<LineKind, number> = {
  header: 0.3,
  italic: 0.2,
  mono: 0.2,
  rule: 0.2,
};
const BOX_PAD_IN = 0.3;

// Gap must fit the longest arrow label, which is centered on the arrow and
// spills over both boxes otherwise. Not calibrated directly: a rendered SVG
// put proportional text above 0.031in/char and mono at ~0.05, so use the top.
const LABEL_CHAR_W_IN = 0.05;
const MIN_GAP_IN = 1.0;

function estimateSize(lines: RenderLine[]): { width: number; height: number } {
  let width = 0;
  let height = 0;
  for (const line of lines) {
    width = Math.max(width, line.text.length * CHAR_W[line.kind]);
    height += LINE_H[line.kind];
  }
  return { width: width + BOX_PAD_IN, height: height + BOX_PAD_IN };
}

/** Lays out `sizes` along one axis as center-coordinates, `gap` apart, first center at `sizes[0]/2`. */
function cumulativeCenters(sizes: number[], gap: number): number[] {
  const centers: number[] = [];
  for (let i = 0; i < sizes.length; i++) {
    const half = sizes[i] / 2;
    centers.push(
      i === 0 ? half : centers[i - 1] + sizes[i - 1] / 2 + gap + half,
    );
  }
  return centers;
}

/**
 * Straight-arrow edges for the first relation between a pair: exit east/west
 * toward the target's column, enter north/south from its row, as in the
 * reference sample (`User.e to Profile.w`, `User.s to Post.n`).
 */
function pickEdges(
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
): { fromEdge: "e" | "w" | "n" | "s"; toEdge: "e" | "w" | "n" | "s" } {
  const colDiff = toCol - fromCol;
  const rowDiff = toRow - fromRow;
  const fromEdge =
    colDiff > 0 ? "e" : colDiff < 0 ? "w" : rowDiff > 0 ? "s" : "n";
  const toEdge =
    rowDiff > 0 ? "n" : rowDiff < 0 ? "s" : colDiff > 0 ? "w" : "e";
  return { fromEdge, toEdge };
}

function pairKey(a: string, b: string): string {
  return [a, b].toSorted().join(" ");
}

/**
 * The "above" (cardinality + alias) and "below" (FK detail) labels for a
 * relation. Shared by the gap-sizing pre-pass and emission so both use the
 * same strings.
 */
function computeLabels(
  model: ERDModel,
  rel: Relation,
  names: ReturnType<typeof buildNameResolver>,
  relationLabelMode: RelationLabelMode,
): { aboveLabel: string; belowLabel: string } {
  const resolvedLabel = resolveRelationLabel(
    model,
    rel,
    names,
    relationLabelMode,
  );
  const aboveLabel = resolvedLabel
    ? `${rel.type} · ${resolvedLabel}`
    : rel.type;

  let belowLabel: string;
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
    belowLabel = `FK ${names.entityId(rel.to)}.${toColumnId} -> ${names.entityId(rel.from)}.${fromColumnId}${actions.length > 0 ? " · " + actions.join(" · ") : ""}`;
  } else {
    // Unresolvable FK columns (e.g. an implicit many-to-many join table
    // isn't a modeled entity): dashed below is the visual flag for this,
    // same reasoning as the reference sample's Legend note.
    belowLabel =
      rel.type === "n-n"
        ? "many-to-many via an implicit join table (columns not modeled)"
        : "columns not modeled";
  }

  return { aboveLabel, belowLabel };
}

export const pikchrEmitter: Emitter = {
  format: "pikchr",
  fileExtension: "pikchr",
  emit(model, options) {
    const {
      typeMode,
      nameMode = "model",
      relationLabelMode = "both",
      caseMode = "preserve",
      inflectMode = "preserve",
    } = options;
    const names = buildNameResolver(model, nameMode, caseMode, inflectMode);
    const ids = buildPikchrIds(model.entities);

    // Pass 1: render each entity's field-container contents up front. Both
    // the text emitted below and the width/height estimate used for layout
    // are derived from this single list, so the two can never drift apart.
    const renderFor = new Map<string, RenderLine[]>();
    for (const entity of model.entities) {
      const lines: RenderLine[] = [];
      lines.push({
        text: names.entityId(entity.name),
        style: "bold big",
        kind: "header",
      });
      const entityAlias = names.entityAlias(entity.name);
      if (entityAlias) {
        lines.push({
          text: `(model: ${s(entityAlias)})`,
          style: "italic small",
          kind: "italic",
        });
      }
      if (entity.description) {
        lines.push({
          text: s(entity.description),
          style: "italic small",
          kind: "italic",
        });
      }

      const rows = entity.fields.map((field) => ({
        marker: markerFor(field),
        name: names.fieldId(field),
        type: typeLabelFor(field, typeMode),
        rest: restFor(field, typeMode, names.fieldAlias(field)),
      }));
      const markerW = Math.max(0, ...rows.map((r) => r.marker.length));
      const nameW = Math.max(0, ...rows.map((r) => r.name.length));
      const typeW = Math.max(0, ...rows.map((r) => r.type.length));
      // No marker column at all (no field in this entity is PK/FK/UQ) omits
      // both the column and its separator space, rather than leaving a
      // stray leading space on every field line.
      const fieldTexts = rows.map((r) => {
        const markerPrefix = markerW > 0 ? `${r.marker.padEnd(markerW)} ` : "";
        return `${markerPrefix}${r.name.padEnd(nameW)} ${r.type.padEnd(typeW)} ${r.rest}`.trimEnd();
      });
      for (const text of fieldTexts)
        lines.push({ text, style: "mono small", kind: "mono" });

      // Composite PK/uniques/plain-or-unique indexes only: single-column
      // PK/unique already show inline via each field's marker column, same
      // split the IR itself makes (Entity.primaryKey/uniques only ever
      // carry what a per-field boolean can't express).
      const compositeLines: string[] = [];
      if (entity.primaryKey && entity.primaryKey.length > 0) {
        compositeLines.push(
          `PK (${entity.primaryKey.map((f) => s(names.fieldIdByName(entity, f))).join(", ")})`,
        );
      }
      for (const group of entity.uniques ?? []) {
        compositeLines.push(
          `UNIQUE (${group.map((f) => s(names.fieldIdByName(entity, f))).join(", ")})`,
        );
      }
      for (const idx of entity.indexes ?? []) {
        const cols = idx.fields
          .map((f) => s(names.fieldIdByName(entity, f)))
          .join(", ");
        const namePart = idx.name ? ` ${s(idx.name)}` : "";
        compositeLines.push(
          `${idx.isUnique ? "UNIQUE INDEX" : "INDEX"}${namePart} (${cols})`,
        );
      }
      if (compositeLines.length > 0) {
        const ruleLen = Math.max(
          10,
          Math.round(Math.max(20, ...fieldTexts.map((t) => t.length)) / 2),
        );
        lines.push({
          text: Array.from({ length: ruleLen }, () => "-").join(" "),
          style: "small",
          kind: "rule",
        });
        for (const text of compositeLines) {
          lines.push({ text, style: "italic mono small", kind: "mono" });
        }
      }

      renderFor.set(entity.name, lines);
    }

    // Pass 2: deterministic N-column grid by entity insertion order. Column
    // count is ceil(sqrt(n)) (10 entities -> 4 columns, matching the
    // reference). Column/row extents are each entity's own estimated size,
    // not a single global guess, so the grid scales with actual content
    // instead of a fixed spacing constant that only fits one demo schema.
    const columns = Math.max(
      1,
      Math.ceil(Math.sqrt(model.entities.length || 1)),
    );
    const rowCount = Math.max(1, Math.ceil(model.entities.length / columns));
    const cellFor = new Map<string, { col: number; row: number }>();
    const sizeFor = new Map<string, { width: number; height: number }>();
    model.entities.forEach((entity, i) => {
      cellFor.set(entity.name, {
        col: i % columns,
        row: Math.floor(i / columns),
      });
      sizeFor.set(entity.name, estimateSize(renderFor.get(entity.name)!));
    });

    const colWidths = Array<number>(columns).fill(0);
    const rowHeights = Array<number>(rowCount).fill(0);
    for (const entity of model.entities) {
      const { col, row } = cellFor.get(entity.name)!;
      const size = sizeFor.get(entity.name)!;
      colWidths[col] = Math.max(colWidths[col], size.width);
      rowHeights[row] = Math.max(rowHeights[row], size.height);
    }
    // Size the grid gap from the longest label in the model, so labels on
    // adjacent-cell arrows don't overlap the boxes they connect. Labels on long
    // diagonal arrows can still cross unrelated boxes (known limitation).
    let maxLabelChars = 0;
    for (const rel of model.relations) {
      if (!ids.get(rel.from) || !ids.get(rel.to)) continue;
      const { aboveLabel, belowLabel } = computeLabels(
        model,
        rel,
        names,
        relationLabelMode,
      );
      maxLabelChars = Math.max(
        maxLabelChars,
        aboveLabel.length,
        belowLabel.length,
      );
    }
    const gapIn = Math.max(MIN_GAP_IN, maxLabelChars * LABEL_CHAR_W_IN + 0.6);

    const colX = cumulativeCenters(colWidths, gapIn);
    // Pikchr's y axis increases upward; later rows need a smaller (more
    // negative) y, so the raw top-down centers are negated.
    const rowYRaw = cumulativeCenters(rowHeights, gapIn);
    const positionFor = new Map<string, { x: number; y: number }>();
    for (const entity of model.entities) {
      const { col, row } = cellFor.get(entity.name)!;
      positionFor.set(entity.name, { x: colX[col], y: -rowYRaw[row] });
    }

    const out: string[] = [
      "// Generated by orm2erd.",
      "",
      "oneToOneColor = 0x2E7D32",
      "oneToManyColor = 0x1565C0",
      "manyToManyColor = 0xAD1457",
      "entityFill = 0xF5F5F5",
      "",
      "// Entities",
    ];

    for (const entity of model.entities) {
      const { boxId, fieldsId } = ids.get(entity.name)!;
      const lines = renderFor.get(entity.name)!;
      const pos = positionFor.get(entity.name)!;
      out.push(`${fieldsId}: [`, "    down");
      for (const line of lines)
        out.push(`    text "${s(line.text)}" ${line.style}`);
      out.push(`] at (${fmt(pos.x)}in, ${fmt(pos.y)}in)`);
      out.push(
        `${boxId}: box fill entityFill behind ${fieldsId} at ${fieldsId}.center width ${fieldsId}.width+0.3in height ${fieldsId}.height+0.3in`,
      );
      out.push("");
    }

    out.push("// Relationships");
    const pairCounts = new Map<string, number>();
    const selfLoopCounts = new Map<string, number>();
    for (const rel of model.relations) {
      const fromIds = ids.get(rel.from);
      const toIds = ids.get(rel.to);
      if (!fromIds || !toIds) continue;
      const fromCell = cellFor.get(rel.from)!;
      const toCell = cellFor.get(rel.to)!;

      const { aboveLabel, belowLabel } = computeLabels(
        model,
        rel,
        names,
        relationLabelMode,
      );

      const colorVar =
        rel.type === "1-1"
          ? "oneToOneColor"
          : rel.type === "1-n"
            ? "oneToManyColor"
            : "manyToManyColor";
      const dashed = !rel.fromColumn || !rel.toColumn;

      let path: string;
      if (rel.from === rel.to) {
        // A straight line can't express a loop back to the same box:
        // always a bent path exiting east and re-entering north, same as
        // the reference's self-referential example. Multiple self-loops on
        // one entity fan out with an increasing "up" distance so they don't
        // fully overlap.
        const loopIndex = selfLoopCounts.get(rel.from) ?? 0;
        selfLoopCounts.set(rel.from, loopIndex + 1);
        const size = sizeFor.get(rel.from)!;
        const up = size.height / 2 + 0.3 + loopIndex * 0.4;
        path = `from ${fromIds.boxId}.e then right 0.4in then up ${fmt(up)}in then to ${toIds.boxId}.n`;
      } else {
        const key = pairKey(rel.from, rel.to);
        const occurrence = pairCounts.get(key) ?? 0;
        pairCounts.set(key, occurrence + 1);
        const { fromEdge, toEdge } = pickEdges(
          fromCell.col,
          fromCell.row,
          toCell.col,
          toCell.row,
        );
        if (occurrence === 0) {
          path = `from ${fromIds.boxId}.${fromEdge} to ${toIds.boxId}.${toEdge}`;
        } else {
          // A second (or later) relation between the same entity pair would
          // otherwise fully overlap the first: route it out the
          // perpendicular side instead, offset further per occurrence, same
          // idea as the reference's "posts (last edited)" relation.
          const offset = fmt(0.5 * occurrence);
          if (fromEdge === "e" || fromEdge === "w") {
            // Move sideways before dropping into the target: a second vertical move at
            // `.n`'s x re-enters the source box when the target is shorter on the same
            // row (seen clipping through the source in a real render).
            const dir = toCell.col >= fromCell.col ? "right" : "left";
            path = `from ${fromIds.boxId}.n then up ${offset}in then ${dir} until even with ${toIds.boxId}.n then to ${toIds.boxId}.n`;
          } else {
            const dir = toCell.col >= fromCell.col ? "right" : "left";
            path = `from ${fromIds.boxId}.w then left ${offset}in then ${dir} until even with ${toIds.boxId}.w then to ${toIds.boxId}.w`;
          }
        }
      }

      out.push(
        `arrow ${path}${dashed ? " dashed" : ""} color ${colorVar} "${s(aboveLabel)}" above "${s(belowLabel)}" below small italic`,
      );
    }

    return out.join("\n");
  },
};
