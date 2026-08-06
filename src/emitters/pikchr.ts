import type { Entity, ERDModel, Field, Relation } from "../core/model";
import type { Emitter } from "./types";
import { resolveRelationLabel } from "./label";
import { buildNameResolver } from "./names";
import type { RelationLabelMode, TypeMode } from "../core/format";

// Pikchr has no "table with rows" primitive, no grouping/namespace construct,
// a hard 5-text-term-per-object cap, and no auto-layout engine — every
// object's position is either implicit flow or an explicit coordinate this
// emitter has to compute itself. See docs/samples/pikchr-erd-reference.pikchr
// for the hand-written, parser-validated (pikchr.org/home/pikchrshow) sample
// this mapping is based on, including every syntax gotcha discovered there
// (object labels need a capital initial, bare `x = ...` variables need a
// lowercase initial, `at (x,y)` comes right after `to`/`behind` but before
// `width`/`height` on a `box` line, and a single object can carry at most 5
// text terms — which is why every entity is a field container + a separate
// background box, never one box with a field per text term).

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
 * identifier namespace (`Name`/`NameFields`) — object labels require a
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

// Canonical mode shows the bare word "enum" in the type column — enum
// members are appended as a "[a|b|c]" suffix on the line instead (see
// restFor below), matching the reference sample rather than structurizr's
// inline "enum(a, b)" — Pikchr's field line is already the widest column so
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
  if (fieldAlias) rest += ` — alias: ${s(fieldAlias)}`;
  if (field.description) rest += ` — ${s(field.description)}`;
  return rest;
}

type LineKind = "header" | "italic" | "mono" | "rule";
interface RenderLine {
  text: string;
  style: string;
  kind: LineKind;
}

// Per-character/per-line size estimates used only for this emitter's own
// grid-spacing math (never emitted as literal `width`/`height` attributes —
// those stay dynamically computed from the real container, same as the
// reference sample's `Container.width+0.3in`). Calibrated against the
// reference's own postmortem: a ~100-char mono/small field line rendered a
// box topping out ~6.0in wide, i.e. ~0.055in/char including the 0.3in pad —
// rounded up here since under-estimating overlaps boxes and over-estimating
// only adds whitespace.
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

// Arrow labels are centered on the arrow itself, not fitted into a lane —
// a short arrow with a long "below" FK-detail string (often 60-90 chars)
// spills past both connected boxes unless the gap between grid cells is
// wide enough to hold that label's own estimated width. No live-render
// calibration point exists for this proportional italic/small text (unlike
// CHAR_W.mono above, which was checked against a real rendered SVG), so
// this sits at the top of the plausible band inferred from that same SVG:
// a 72-char label overlapping a 2.23in gap implies >=0.031in/char, and
// mono (monospace, wider per glyph than proportional) measured ~0.0497.
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
 * Straight-line edge choice for the first relation drawn between a given
 * entity pair, from each side's relative grid cell: the exiting side favors
 * the column relationship (leaving east/west toward the target's column),
 * the entering side favors the row relationship (arriving from north/south
 * of the target's row) — matches every straight (non-bent) arrow in the
 * reference sample, e.g. `User.e to Profile.w` (same row) and `User.s to
 * Post.n` (same column, Post one row down).
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
 * The two arrow-label strings for one relation — cardinality+alias
 * ("above") and FK detail ("below"), same composition structurizr.ts uses
 * for its `description`/`technology` pair. Called once in a pre-pass (to
 * size the grid gap around the longest label) and again during emission;
 * kept as one function so the two call sites can't drift onto different
 * strings for the same relation.
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
    // isn't a modeled entity) — dashed below is the visual flag for this,
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

    // Pass 1: render each entity's field-container contents up front — both
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

      // Composite PK/uniques/plain-or-unique indexes only — single-column
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

    // Pass 2: deterministic N-column grid by entity insertion order — column
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
    // A relation's label is centered on the arrow itself, not fitted into
    // whatever gap surrounds it — a same-row/same-column pair with a short
    // arrow and a long FK-detail label otherwise overlaps both boxes it
    // connects (confirmed against a real rendered SVG: a 72-char label on
    // a 2.23in gap spilled into both neighbors). Sizing the gap from the
    // longest label in the whole model fixes every adjacent-cell relation;
    // it does NOT fix a label on a long diagonal arrow that happens to
    // cross near an unrelated box in between — same collision-unaware
    // limitation the reference sample already discloses for plain lines.
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
        // A straight line can't express a loop back to the same box —
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
          // otherwise fully overlap the first — route it out the
          // perpendicular side instead, offset further per occurrence, same
          // idea as the reference's "posts (last edited)" relation.
          const offset = fmt(0.5 * occurrence);
          if (fromEdge === "e" || fromEdge === "w") {
            // The "until even with" leg must move SIDEWAYS (matching the
            // target's x), not vertically again (matching its y): `.n` sits
            // on the box's own horizontal center-line, so a second vertical
            // move at that same x re-enters the source box whenever the
            // target's own top edge is lower than the source's (a shorter
            // target box, same row) — confirmed against a real render where
            // this clipped straight through the top of the source entity.
            // Moving sideways first leaves that center-line before any
            // further vertical travel, so the final drop into the target
            // can't clip back through the source.
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
