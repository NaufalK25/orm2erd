import type { Entity, Field } from "../core/model";
import type { Emitter } from "./types";
import type { TypeMode } from "../core/format";
import { resolveRelationLabel } from "./label";
import { buildNameResolver, type NameResolver } from "./names";

// .excalidraw is a GUI editor's save format, not a diagram-as-code DSL: like
// the .drawio emitter this one places everything itself, but Excalidraw has
// no table/entity shape at all (its whole vocabulary is rectangle/text/arrow/
// frame/...), so the entity convention below — one `frame` per entity whose
// `name` floats above it as the header, one `rectangle` per row, two floating
// `text` elements per row — is orm2erd's own invention, per
// docs/excalidraw-format-reference.md §2. The `cardinality_*` arrowheads are
// the format's own, verified against Excalidraw's source (§7.1).
//
// Two rules the format enforces that draw.io doesn't:
//   - every x/y is absolute, `frameId` is pure membership with no coordinate
//     meaning (§3), so row positions are computed from the entity offset here;
//   - `boundElements` on a shape is the reciprocal of an arrow's
//     start/endBinding and is NOT reconstructed on load (§5), so arrows are
//     computed before any row rectangle is built.

const ROW_H = 30;
const KEY_W = 30;
const GAP_X = 120;
const GAP_Y = 100;
const ORIGIN = 40;
const MIN_FRAME_W = 200;
const FONT_SIZE = 14;
// Hand-drawn Virgil has no metrics available here; §6's estimate is close
// enough — the app re-measures against real font metrics on load, so being
// off is cosmetic until the file is opened once.
const CHAR_W = FONT_SIZE * 0.52;
const TEXT_H = Math.round(FONT_SIZE * 1.25);
const TEXT_PAD = Math.round((ROW_H - TEXT_H) / 2);

const STROKE = "#1e1e1e";
// The only PK emphasis this format can express: text elements have no bold/
// italic/underline flag at all (§1), so the row's fill carries it.
const PK_BG = "#e9ecef";

const textWidth = (text: string): number => Math.round(text.length * CHAR_W);

function typeLabelFor(field: Field, typeMode: TypeMode): string {
  const base = typeMode === "native" ? field.nativeType : field.type;
  return `${base.toUpperCase()}${field.isList ? "[]" : ""}`;
}

/**
 * The one free-text slot per column: this format has no structural place for
 * type/nullability/default/description, so they're crammed into the row's
 * name text the same way the draw.io emitter crams them into the name cell.
 */
function fieldTextFor(
  field: Field,
  names: NameResolver,
  typeMode: TypeMode,
): string {
  const parts = [
    names.fieldId(field),
    typeLabelFor(field, typeMode),
    field.isNullable ? "NULL" : "NOT NULL",
  ];
  if (field.isUnique) parts.push("UNIQUE");
  if (field.enumValues && field.enumValues.length > 0) {
    parts.push(`[${field.enumValues.join("|")}]`);
  }
  if (field.defaultValue) parts.push(`DEFAULT ${field.defaultValue}`);
  const alias = names.fieldAlias(field);
  if (alias) parts.push(`(${alias})`);
  if (field.description) parts.push(`— ${field.description}`);
  return parts.join(" ");
}

interface Row {
  /** Key-marker text: "PK", "FK1", "PK, FK1", or "" for an ordinary column. */
  marker: string;
  text: string;
  isPk: boolean;
  /** Model-level field name this row renders, for relation anchoring; absent on constraint rows. */
  fieldName?: string;
}

function buildRows(
  entity: Entity,
  names: NameResolver,
  typeMode: TypeMode,
): Row[] {
  let fkIndex = 0;
  const rows: Row[] = entity.fields.map((field) => {
    const marker = [
      field.isPrimaryKey && "PK",
      field.isForeignKey && `FK${++fkIndex}`,
    ]
      .filter((m): m is string => Boolean(m))
      .join(", ");
    return {
      marker,
      text: fieldTextFor(field, names, typeMode),
      isPk: Boolean(field.isPrimaryKey),
      fieldName: field.name,
    };
  });

  // Composite uniques/indexes have no native construct here either; they ride
  // along as extra marker-less rows. Relations anchor by field name, so these
  // trailing rows can never be hit as an endpoint.
  for (const group of entity.uniques ?? []) {
    rows.push({
      marker: "",
      isPk: false,
      text: `UNIQUE (${group.map((f) => names.fieldIdByName(entity, f)).join(", ")})`,
    });
  }
  for (const index of entity.indexes ?? []) {
    const cols = index.fields
      .map((f) => names.fieldIdByName(entity, f))
      .join(", ");
    rows.push({
      marker: "",
      isPk: false,
      text: `${index.isUnique ? "UNIQUE INDEX" : "INDEX"}${index.name ? ` ${index.name}` : ""} (${cols})`,
    });
  }

  return rows;
}

/** §7.2: `to` is always the FK-holding child side, and the child end is always optional. */
function arrowheadsFor(type: string, isFromOptional?: boolean) {
  if (type === "n-n") {
    return {
      start: "cardinality_zero_or_many",
      end: "cardinality_zero_or_many",
    };
  }
  return {
    start: isFromOptional
      ? "cardinality_zero_or_one"
      : "cardinality_exactly_one",
    end:
      type === "1-1" ? "cardinality_zero_or_one" : "cardinality_zero_or_many",
  };
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const excalidrawEmitter: Emitter = {
  format: "excalidraw",
  fileExtension: "excalidraw",
  emit(model, options) {
    const {
      typeMode,
      nameMode = "model",
      relationLabelMode = "both",
      caseMode = "preserve",
      inflectMode = "preserve",
    } = options;
    const names = buildNameResolver(model, nameMode, caseMode, inflectMode);

    // Pass 1: rows + size per entity. IDs are index-based so they're unique by
    // construction and stable across runs, which --check depends on.
    interface Frame extends Box {
      id: string;
      header: string;
      rows: Row[];
    }
    const frames: Frame[] = model.entities.map((entity, i) => {
      const rows = buildRows(entity, names, typeMode);
      const alias = names.entityAlias(entity.name);
      const header = [
        names.entityId(entity.name),
        alias && `(${alias})`,
        entity.description && `— ${entity.description}`,
      ]
        .filter((p): p is string => Boolean(p))
        .join(" ");
      const widest = Math.max(
        textWidth(header),
        ...rows.map((r) => KEY_W + textWidth(r.text)),
      );
      return {
        id: `e${i}`,
        header,
        rows,
        // The frame's label floats above its top edge (§2), so unlike
        // draw.io's startSize band it costs no internal height.
        width: Math.max(MIN_FRAME_W, Math.ceil((widest + 20) / 10) * 10),
        height: Math.max(ROW_H, rows.length * ROW_H),
        x: 0,
        y: 0,
      };
    });

    // Pass 2: naive grid — no auto-layout in this format, and the user can
    // drag things around in the app, so nothing here tries to avoid edge
    // crossings; it just guarantees no two frames overlap.
    const columns = Math.max(1, Math.ceil(Math.sqrt(frames.length || 1)));
    const colWidths: number[] = [];
    const rowHeights: number[] = [];
    frames.forEach((frame, i) => {
      const col = i % columns;
      const row = Math.floor(i / columns);
      colWidths[col] = Math.max(colWidths[col] ?? 0, frame.width);
      rowHeights[row] = Math.max(rowHeights[row] ?? 0, frame.height);
    });
    frames.forEach((frame, i) => {
      const col = i % columns;
      const row = Math.floor(i / columns);
      frame.x =
        ORIGIN + colWidths.slice(0, col).reduce((sum, w) => sum + w + GAP_X, 0);
      frame.y =
        ORIGIN +
        rowHeights.slice(0, row).reduce((sum, h) => sum + h + GAP_Y, 0);
    });

    const frameByEntity = new Map(
      model.entities.map((entity, i) => [entity.name, frames[i]]),
    );
    /**
     * Arrows dock to a specific *row* rectangle, never the frame or a text
     * element (§7), so an endpoint resolves to the row of its FK/referenced
     * column. `fromColumn`/`toColumn` are model-level attribute names (never
     * physical column names), so they match on `Row.fieldName`. Falls back to
     * the PK row, then the first row — an entity with no rows at all has no
     * rectangle to bind to, so the relation is dropped.
     */
    const anchor = (
      entityName: string,
      column?: string,
    ): { id: string; box: Box } | undefined => {
      const frame = frameByEntity.get(entityName);
      if (!frame || frame.rows.length === 0) return undefined;
      const byColumn = column
        ? frame.rows.findIndex((r) => r.fieldName === column)
        : -1;
      const byPk = frame.rows.findIndex((r) => r.isPk);
      const index = byColumn >= 0 ? byColumn : byPk >= 0 ? byPk : 0;
      return {
        id: `${frame.id}_r${index}`,
        box: {
          x: frame.x,
          y: frame.y + index * ROW_H,
          width: frame.width,
          height: ROW_H,
        },
      };
    };

    // Pass 3: arrows first, because `boundElements` on each row rectangle is
    // the reciprocal half of an arrow's bindings and the app doesn't rebuild
    // it from the bindings on load (§5) — the rectangles below read this map.
    interface Arrow {
      id: string;
      label: string;
      x: number;
      y: number;
      dx: number;
      dy: number;
      start: { id: string; fixedPoint: [number, number] };
      end: { id: string; fixedPoint: [number, number] };
      startArrowhead: string;
      endArrowhead: string;
    }
    const arrows: Arrow[] = [];
    const boundTo = new Map<string, { id: string; type: "arrow" }[]>();
    const bind = (rowId: string, arrowId: string) => {
      const list = boundTo.get(rowId) ?? [];
      list.push({ id: arrowId, type: "arrow" });
      boundTo.set(rowId, list);
    };

    model.relations.forEach((rel, i) => {
      const source = anchor(rel.from, rel.fromColumn);
      const target = anchor(rel.to, rel.toColumn);
      if (!source || !target) return;
      const id = `rel${i}`;
      // The grid puts the child left of, or (once it wraps) above the parent
      // about as often as not, and nothing auto-routes here — `elbowed: false`
      // draws a straight line, and draw.io's entityRelationEdgeStyle has no
      // analog. So both ends leave from whichever edge actually faces the
      // other row, rather than the reference sample's always-right→left pair.
      const spanX =
        target.box.x +
        target.box.width / 2 -
        (source.box.x + source.box.width / 2);
      const spanY = target.box.y - source.box.y;

      let start: [number, number];
      let end: [number, number];
      let sx: number;
      let sy: number;
      let ex: number;
      let ey: number;
      if (Math.abs(spanY) > Math.abs(spanX)) {
        const down = spanY > 0;
        start = [0.5, down ? 1 : 0];
        end = [0.5, down ? 0 : 1];
        sx = source.box.x + source.box.width / 2;
        sy = down ? source.box.y + ROW_H : source.box.y;
        ex = target.box.x + target.box.width / 2;
        ey = down ? target.box.y : target.box.y + ROW_H;
      } else {
        const right = spanX >= 0;
        start = [right ? 1 : 0, 0.5];
        end = [right ? 0 : 1, 0.5];
        sx = right ? source.box.x + source.box.width : source.box.x;
        sy = source.box.y + ROW_H / 2;
        ex = right ? target.box.x : target.box.x + target.box.width;
        ey = target.box.y + ROW_H / 2;
      }

      const heads = arrowheadsFor(rel.type, rel.isFromOptional);
      arrows.push({
        id,
        label: resolveRelationLabel(model, rel, names, relationLabelMode),
        x: sx,
        y: sy,
        dx: ex - sx,
        dy: ey - sy,
        start: { id: source.id, fixedPoint: start },
        end: { id: target.id, fixedPoint: end },
        startArrowhead: heads.start,
        endArrowhead: heads.end,
      });
      bind(source.id, id);
      bind(target.id, id);
    });

    // Pass 4: serialize. `elements` is a flat array whose order doesn't encode
    // nesting (§4) — everything resolves by id. seed/versionNonce are
    // counter-driven rather than random so reruns are byte-identical.
    let nonce = 1;
    const base = (
      id: string,
      type: string,
      box: Box,
      extra: Record<string, unknown> = {},
    ) => ({
      id,
      type,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      angle: 0,
      strokeColor: STROKE,
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 100,
      groupIds: [] as string[],
      frameId: null as string | null,
      index: null,
      roundness: null,
      seed: nonce++,
      version: 1,
      versionNonce: nonce++,
      isDeleted: false,
      boundElements: null as { id: string; type: string }[] | null,
      updated: 0,
      link: null,
      locked: false,
      ...extra,
    });

    const text = (
      id: string,
      value: string,
      box: { x: number; y: number },
      frameId: string | null,
      textAlign = "left",
    ) =>
      base(
        id,
        "text",
        { ...box, width: textWidth(value), height: TEXT_H },
        {
          frameId,
          text: value,
          fontSize: FONT_SIZE,
          fontFamily: 1,
          textAlign,
          verticalAlign: "top",
          containerId: null,
          originalText: value,
          autoResize: true,
          lineHeight: 1.25,
        },
      );

    const elements: unknown[] = [];

    for (const frame of frames) {
      elements.push(base(frame.id, "frame", frame, { name: frame.header }));
      frame.rows.forEach((row, r) => {
        const rowId = `${frame.id}_r${r}`;
        const y = frame.y + r * ROW_H;
        elements.push(
          base(
            rowId,
            "rectangle",
            { x: frame.x, y, width: frame.width, height: ROW_H },
            {
              frameId: frame.id,
              backgroundColor: row.isPk ? PK_BG : "transparent",
              boundElements: boundTo.get(rowId) ?? null,
            },
          ),
        );
        if (row.marker) {
          elements.push(
            text(
              `${rowId}_key`,
              row.marker,
              { x: frame.x + 4, y: y + TEXT_PAD },
              frame.id,
            ),
          );
        }
        elements.push(
          text(
            `${rowId}_name`,
            row.text,
            { x: frame.x + KEY_W + 4, y: y + TEXT_PAD },
            frame.id,
          ),
        );
      });
    }

    for (const arrow of arrows) {
      elements.push(
        base(
          arrow.id,
          "arrow",
          {
            x: arrow.x,
            y: arrow.y,
            // width/height are magnitudes; `points` carries the direction.
            width: Math.abs(arrow.dx),
            height: Math.abs(arrow.dy),
          },
          {
            strokeWidth: 2,
            points: [
              [0, 0],
              [arrow.dx, arrow.dy],
            ],
            lastCommittedPoint: null,
            startBinding: {
              elementId: arrow.start.id,
              fixedPoint: arrow.start.fixedPoint,
              mode: "inside",
            },
            endBinding: {
              elementId: arrow.end.id,
              fixedPoint: arrow.end.fixedPoint,
              mode: "inside",
            },
            startArrowhead: arrow.startArrowhead,
            endArrowhead: arrow.endArrowhead,
            elbowed: false,
          },
        ),
      );
      // No value-on-the-edge shortcut here (§7): the label is an ordinary
      // free-floating text element nudged above the arrow's midpoint.
      if (arrow.label) {
        elements.push(
          text(
            `${arrow.id}_label`,
            arrow.label,
            {
              x: Math.round(
                arrow.x + arrow.dx / 2 - textWidth(arrow.label) / 2,
              ),
              y: Math.round(arrow.y + arrow.dy / 2) - TEXT_H - 2,
            },
            null,
            "center",
          ),
        );
      }
    }

    return `${JSON.stringify(
      {
        type: "excalidraw",
        version: 2,
        source: "https://excalidraw.com",
        elements,
        appState: { gridSize: 20, viewBackgroundColor: "#ffffff" },
        files: {},
      },
      null,
      2,
    )}\n`;
  },
};
