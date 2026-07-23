import type { Emitter } from "./types";

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
    const { typeMode } = options;

    const lines = [
      "digraph ERD {",
      "  rankdir=LR;",
      "  node [shape=plaintext];",
      "",
      "  // Entities",
    ];

    for (const entity of model.entities) {
      lines.push(
        `  ${quoteId(entity.name)} [label=<`,
        '    <table border="0" cellborder="1" cellspacing="0" cellpadding="4">',
        `      <tr><td align="center" colspan="2"><b>${escapeHtml(entity.name)}</b></td></tr>`,
      );
      for (const field of entity.fields) {
        let displayType = typeMode === "native" ? field.nativeType : field.type;
        if (field.type === "enum") {
          displayType = `enum(${field.enumValues?.join(", ")})`;
        }
        const typeLabel = `${displayType}${field.isList ? "[]" : ""}`;
        const constraints = [
          field.isPrimaryKey && "PK",
          field.isForeignKey && "FK",
          field.isUnique && "UNIQUE",
          field.isNullable && "nullable",
          field.defaultValue && `= ${field.defaultValue}`,
        ].filter((c): c is string => Boolean(c));
        // Every field gets a port (`port="<name>"`), not just constrained
        // ones: a relation column that lands on an unported field would
        // silently anchor its edge to the whole node instead of erroring.
        lines.push(
          `      <tr><td align="left" port="${escapeHtml(field.name)}"><b>${escapeHtml(field.name)}</b>  <i>${escapeHtml(typeLabel)}</i></td><td align="left">${escapeHtml(constraints.join(", "))}</td></tr>`,
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
      // side (see Relation.type in core/model.ts).
      const relationDetails =
        rel.type === "1-n"
          ? '[arrowhead=crow, arrowtail=tee, dir=both, label="1-n"]'
          : rel.type === "n-n"
            ? "[arrowhead=none, arrowtail=crow, dir=both]"
            : '[arrowhead=teetee, arrowtail=teetee, dir=both, label="1-1"]';
      lines.push(
        `  ${quoteId(rel.from)}:${quoteId(rel.fromColumn)} -> ${quoteId(rel.to)}:${quoteId(rel.toColumn)} ${relationDetails};`,
      );
    }

    lines.push("}");

    return lines.join("\n");
  },
};
