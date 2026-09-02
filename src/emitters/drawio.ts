import type { Entity, Field } from "../core/model";
import type { Emitter } from "./types";
import type { TypeMode } from "../core/format";
import { resolveRelationLabel } from "./label";
import { buildNameResolver, type NameResolver } from "./names";

// .drawio is the native save format of a GUI editor, not a diagram-as-code
// DSL: it's absolute-positioned XML with no auto-layout, so this emitter also
// has to place every entity itself (see the grid pass in emit()). Every style
// string, the three-level table/row/cell nesting and the six ER cardinality
// markers below are copied verbatim from docs/drawio-format-reference.md,
// which was verified against real app-generated files and draw.io's own
// mxER.js — don't "tidy" them, the table shape only renders with this exact
// set of style keys.

const HEADER_H = 30;
const ROW_H = 30;
const KEY_W = 30;
const GAP_X = 80;
const GAP_Y = 60;
const ORIGIN = 40;
const MIN_TABLE_W = 200;
// Rows set overflow=hidden, so an under-estimated width clips text invisibly
// rather than spilling — these round up on purpose (draw.io's default 12px
// Helvetica averages ~6.6px/char, bold header a little more).
const CHAR_W = 7;
const HEADER_CHAR_W = 8;

const TABLE_STYLE =
  "shape=table;startSize=30;container=1;collapsible=1;childLayout=tableLayout;fixedRows=1;rowLines=0;fontStyle=1;align=center;resizeLast=1;";

const rowStyle = (isFirst: boolean): string =>
  `shape=partialRectangle;horizontal=0;startSize=0;swimlaneHead=0;swimlaneBody=0;fillColor=none;collapsible=0;dropTarget=0;pointerEvents=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;top=0;left=0;right=0;bottom=${isFirst ? 1 : 0};`;

// PK emphasis is bold on the marker cell + bold/underline (fontStyle bitmask
// 1|4) on the name cell. There is deliberately no FK equivalent: real
// app-generated files convey FK-ness only through the "FK1"/"FK2" marker
// text, despite third-party guides claiming an italic convention.
const keyStyle = (isPk: boolean): string =>
  `shape=partialRectangle;connectable=0;fillColor=none;top=0;left=0;bottom=0;right=0;${isPk ? "fontStyle=1;" : ""}overflow=hidden;`;

const nameStyle = (isPk: boolean): string =>
  `shape=partialRectangle;connectable=0;fillColor=none;top=0;left=0;bottom=0;right=0;align=left;spacingLeft=6;${isPk ? "fontStyle=5;" : ""}overflow=hidden;`;

/** XML attribute-text escaping — `&` first, or the later replacements get double-escaped. */
function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function typeLabelFor(field: Field, typeMode: TypeMode): string {
  const base = typeMode === "native" ? field.nativeType : field.type;
  return `${base.toUpperCase()}${field.isList ? "[]" : ""}`;
}

/**
 * The one free-text slot per column: this format has no structural place for
 * type/nullability/default/description, so they're crammed into the name
 * cell's value the same way the reference sample does
 * (`"customer_id INT NOT NULL"`).
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
  /** Key-marker cell text: "PK", "FK1", "PK, FK1", or "" for an ordinary column. */
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
    // Composite PK members already carry isPrimaryKey per-field, so
    // entity.primaryKey needs no separate handling here.
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

  // Composite uniques/indexes have no native construct in this format. Rather
  // than drop them, they ride along as extra marker-less rows — the row
  // builder and the height formula already handle any row count, and
  // relations anchor by field name so trailing rows can't be hit.
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

/** §4.2: `to` is always the FK-holding child side, and the child end is always optional. */
function arrowsFor(type: string, isFromOptional?: boolean) {
  if (type === "n-n") {
    return { start: "ERzeroToMany", end: "ERzeroToMany" };
  }
  return {
    start: isFromOptional ? "ERzeroToOne" : "ERmandOne",
    end: type === "1-1" ? "ERzeroToOne" : "ERzeroToMany",
  };
}

export const drawioEmitter: Emitter = {
  format: "drawio",
  fileExtension: "drawio",
  emit(model, options) {
    const {
      typeMode,
      nameMode = "model",
      relationLabelMode = "both",
      caseMode = "preserve",
      inflectMode = "preserve",
    } = options;
    const names = buildNameResolver(model, nameMode, caseMode, inflectMode);

    // Pass 1: rows + size per entity. IDs are index-based so they're unique
    // by construction (draw.io IDs are arbitrary strings, nothing reads them)
    // and stable across runs, which --check depends on.
    interface Table {
      id: string;
      header: string;
      rows: Row[];
      width: number;
      height: number;
      x: number;
      y: number;
    }
    const tables: Table[] = model.entities.map((entity, i) => {
      const rows = buildRows(entity, names, typeMode);
      const alias = names.entityAlias(entity.name);
      const header = [
        names.entityId(entity.name),
        alias && `(${alias})`,
        entity.description && `— ${entity.description}`,
      ]
        .filter((p): p is string => Boolean(p))
        .join(" ");
      const textWidth = Math.max(
        header.length * HEADER_CHAR_W,
        ...rows.map((r) => KEY_W + (r.marker.length + r.text.length) * CHAR_W),
      );
      return {
        id: `e${i}`,
        header,
        rows,
        width: Math.max(MIN_TABLE_W, Math.ceil((textWidth + 20) / 10) * 10),
        height: HEADER_H + rows.length * ROW_H,
        x: 0,
        y: 0,
      };
    });

    // Pass 2: naive grid — this format has no auto-layout, and draw.io lets
    // the user drag things around, so nothing here tries to avoid edge
    // crossings; it just guarantees no two tables overlap.
    const columns = Math.max(1, Math.ceil(Math.sqrt(tables.length || 1)));
    const colWidths: number[] = [];
    const rowHeights: number[] = [];
    tables.forEach((table, i) => {
      const col = i % columns;
      const row = Math.floor(i / columns);
      colWidths[col] = Math.max(colWidths[col] ?? 0, table.width);
      rowHeights[row] = Math.max(rowHeights[row] ?? 0, table.height);
    });
    tables.forEach((table, i) => {
      const col = i % columns;
      const row = Math.floor(i / columns);
      table.x =
        ORIGIN + colWidths.slice(0, col).reduce((sum, w) => sum + w + GAP_X, 0);
      table.y =
        ORIGIN +
        rowHeights.slice(0, row).reduce((sum, h) => sum + h + GAP_Y, 0);
    });

    const pageWidth = Math.max(
      850,
      ORIGIN * 2 + colWidths.reduce((sum, w) => sum + w + GAP_X, -GAP_X),
    );
    const pageHeight = Math.max(
      1100,
      ORIGIN * 2 + rowHeights.reduce((sum, h) => sum + h + GAP_Y, -GAP_Y),
    );

    const out: string[] = [
      "<!-- Generated by orm2erd. -->",
      '<mxfile host="app.diagrams.net">',
      '  <diagram id="orm2erd" name="ERD">',
      `    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageWidth}" pageHeight="${pageHeight}" math="0" shadow="0">`,
      "      <root>",
      '        <mxCell id="0" />',
      '        <mxCell id="1" parent="0" />',
    ];

    for (const table of tables) {
      out.push(
        `        <mxCell id="${table.id}" value="${esc(table.header)}" style="${TABLE_STYLE}" vertex="1" parent="1">`,
        `          <mxGeometry x="${table.x}" y="${table.y}" width="${table.width}" height="${table.height}" as="geometry" />`,
        "        </mxCell>",
      );
      table.rows.forEach((row, r) => {
        const rowId = `${table.id}_r${r}`;
        out.push(
          `        <mxCell id="${rowId}" style="${rowStyle(r === 0)}" vertex="1" parent="${table.id}">`,
          `          <mxGeometry y="${HEADER_H + r * ROW_H}" width="${table.width}" height="${ROW_H}" as="geometry" />`,
          "        </mxCell>",
          `        <mxCell id="${rowId}_key" value="${esc(row.marker)}" style="${keyStyle(row.isPk)}" vertex="1" parent="${rowId}">`,
          `          <mxGeometry width="${KEY_W}" height="${ROW_H}" as="geometry" />`,
          "        </mxCell>",
          `        <mxCell id="${rowId}_name" value="${esc(row.text)}" style="${nameStyle(row.isPk)}" vertex="1" parent="${rowId}">`,
          `          <mxGeometry x="${KEY_W}" width="${table.width - KEY_W}" height="${ROW_H}" as="geometry" />`,
          "        </mxCell>",
        );
      });
    }

    const tableByEntity = new Map(
      model.entities.map((entity, i) => [entity.name, tables[i]]),
    );
    /**
     * Edges dock to a specific *row* cell, so a relation endpoint resolves to
     * the row of its FK/referenced column. `fromColumn`/`toColumn` are
     * model-level attribute names (never physical column names), so they match
     * on `Row.fieldName`. Falls back to the PK row, then the first row, then
     * the table cell itself for an entity with no fields at all.
     */
    const anchor = (
      entityName: string,
      column?: string,
    ): string | undefined => {
      const table = tableByEntity.get(entityName);
      if (!table) return undefined;
      const byColumn = column
        ? table.rows.findIndex((r) => r.fieldName === column)
        : -1;
      const index =
        byColumn >= 0 ? byColumn : table.rows.findIndex((r) => r.isPk);
      if (index >= 0) return `${table.id}_r${index}`;
      return table.rows.length > 0 ? `${table.id}_r0` : table.id;
    };

    model.relations.forEach((rel, i) => {
      const source = anchor(rel.from, rel.fromColumn);
      const target = anchor(rel.to, rel.toColumn);
      if (!source || !target) return;
      const { start, end } = arrowsFor(rel.type, rel.isFromOptional);
      const label = resolveRelationLabel(model, rel, names, relationLabelMode);
      out.push(
        `        <mxCell id="rel${i}" value="${esc(label)}" style="edgeStyle=entityRelationEdgeStyle;html=1;startArrow=${start};startFill=0;endArrow=${end};endFill=0;" edge="1" parent="1" source="${source}" target="${target}">`,
        '          <mxGeometry width="100" height="100" relative="1" as="geometry">',
        '            <mxPoint x="0" y="0" as="sourcePoint" />',
        '            <mxPoint x="0" y="0" as="targetPoint" />',
        "          </mxGeometry>",
        "        </mxCell>",
      );
    });

    out.push(
      "      </root>",
      "    </mxGraphModel>",
      "  </diagram>",
      "</mxfile>",
    );
    return out.join("\n");
  },
};
