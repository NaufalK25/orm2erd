import type { Emitter } from "./types";
import { compositeUniqueMates } from "./uniques";
import { buildNameResolver } from "./names";

// Text interpolated into an HTML-like label (`label=<...>`) must be
// HTML-escaped — an unescaped `&`, `<`, or `>` from a field name, type,
// enum value, or default value corrupts the whole node. Escape `&` first
// so we don't double-escape the entities we introduce.
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// Node IDs and ports referenced outside the HTML label live in DOT syntax,
// where unquoted identifiers can collide with reserved keywords (`node`,
// `edge`, `graph`, `subgraph`, `strict`, `digraph` — case-insensitive) or
// break on spaces/hyphens. Quote unconditionally rather than chase an
// allowlist.
function quoteId(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export const graphvizdotEmitter: Emitter = {
  format: "graphvizdot",
  fileExtension: "gv",
  emit(model, options) {
    const { typeMode, nameMode = "model" } = options;
    const names = buildNameResolver(model, nameMode);

    const lines = [
      "digraph ERD {",
      "  rankdir=LR;",
      "  node [shape=plaintext];",
      "",
      "  // Entities",
    ];

    for (const entity of model.entities) {
      const entityId = names.entityId(entity.name);
      const entityAlias = names.entityAlias(entity.name);
      lines.push(
        `  ${quoteId(entityId)} [label=<`,
        '    <table border="0" cellborder="1" cellspacing="0" cellpadding="4">',
        `      <tr><td align="center" colspan="2"><b>${escapeHtml(entityId)}</b></td></tr>`,
      );
      if (entityAlias) {
        lines.push(
          `      <tr><td align="center" colspan="2"><i>${escapeHtml(entityAlias)}</i></td></tr>`,
        );
      }
      for (const field of entity.fields) {
        let displayType = typeMode === "native" ? field.nativeType : field.type;
        if (field.type === "enum") {
          displayType = `enum(${field.enumValues?.join(", ")})`;
        }
        const typeLabel = `${displayType}${field.isList ? "[]" : ""}`;
        const uniqueMates = compositeUniqueMates(entity, field);
        const fieldAlias = names.fieldAlias(field);
        const constraints = [
          field.isPrimaryKey && "PK",
          field.isForeignKey && "FK",
          (field.isUnique || uniqueMates) && "UNIQUE",
          uniqueMates &&
            uniqueMates.length > 0 &&
            `unique with: ${uniqueMates.map((mate) => names.fieldIdByName(entity, mate)).join(", ")}`,
          fieldAlias && `alias: ${fieldAlias}`,
          field.isNullable && "nullable",
          field.defaultValue && `= ${field.defaultValue}`,
        ].filter((c): c is string => Boolean(c));
        const fieldId = names.fieldId(field);
        // Every field gets a port (`port="<name>"`), not just constrained
        // ones: a relation column that lands on an unported field would
        // silently anchor its edge to the whole node instead of erroring.
        // The port itself must stay the field's original name — relations
        // resolve `fromColumn`/`toColumn` against the IR, not the display
        // identifier — while the visible label follows `nameMode`.
        lines.push(
          `      <tr><td align="left" port="${escapeHtml(field.name)}"><b>${escapeHtml(fieldId)}</b>  <i>${escapeHtml(typeLabel)}</i></td><td align="left">${escapeHtml(constraints.join(", "))}</td></tr>`,
        );
      }
      lines.push("    </table>>];");
      lines.push("");
    }

    lines.push("  // Relationships");
    for (const rel of model.relations) {
      // A DOT port reference needs a real table:column on both sides — skip
      // relations we can't resolve columns for (e.g. an implicit
      // many-to-many join table isn't a modeled entity) rather than emit a
      // bare "TableA -> TableB", which would anchor to whole nodes.
      if (!rel.fromColumn || !rel.toColumn) continue;

      // Graphviz has no inline cardinality symbol like Mermaid/DBML —
      // crow's-foot notation is set via arrowhead/arrowtail shapes on the
      // edge. `from` is the "one" side and `to` is the "many"/FK-holding
      // side (see Relation.type in core/model.ts). `arrowhead` (at `to`)
      // stays the plain "odot" (optional) form unconditionally — nothing
      // in a FK model forces a parent row to have a matching row on the
      // FK-holding side — while `arrowtail` (at `from`) varies with
      // isFromOptional: "tee" (required) unless the FK column is
      // nullable, in which case it downgrades to "teeodot" (optional).
      const arrowtail = rel.isFromOptional ? "teeodot" : "tee";
      const relationDetails =
        rel.type === "1-n"
          ? `[arrowhead=crowodot, arrowtail=${arrowtail}, dir=both, label="1-n"]`
          : rel.type === "n-n"
            ? "[arrowhead=none, arrowtail=crow, dir=both]"
            : `[arrowhead=teeodot, arrowtail=${arrowtail}, dir=both, label="1-1"]`;
      lines.push(
        `  ${quoteId(names.entityId(rel.from))}:${quoteId(rel.fromColumn)} -> ${quoteId(names.entityId(rel.to))}:${quoteId(rel.toColumn)} ${relationDetails};`,
      );
    }

    lines.push("}");

    return lines.join("\n");
  },
};
