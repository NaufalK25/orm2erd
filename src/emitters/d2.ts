import type { Emitter } from "./types";

// D2 has reserved top-level keywords (shape, classes, near, constraint,
// style, vars, layers, ...) that break parsing if used unquoted as a map
// key — quote every identifier unconditionally rather than chasing an
// allowlist of keywords that can change between D2 versions.
function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '\\"')}"`;
}

export const d2Emitter: Emitter = {
  format: "d2",
  fileExtension: "d2",
  emit(model, options) {
    const { typeMode } = options;

    const lines = ["# Entities"];

    for (const entity of model.entities) {
      lines.push(`${quoteIdent(entity.name)}: {`, "  shape: sql_table");
      for (const field of entity.fields) {
        let displayType = typeMode === "native" ? field.nativeType : field.type;
        if (field.type === "enum") {
          displayType = `enum(${field.enumValues?.join(", ")})`;
        }
        const typeLabel = `${displayType}${field.isList ? "[]" : ""}`;
        const defaultValueDisplay = field.defaultValue
          ? field.defaultValue.replaceAll('"', "'")
          : undefined;
        const comments = [
          typeLabel,
          !field.isNullable && "NOT NULL",
          field.defaultValue && `DEFAULT ${defaultValueDisplay}`,
        ].filter((c): c is string => Boolean(c));
        const constraints = [
          field.isPrimaryKey && "pk",
          field.isForeignKey && "fk",
          field.isUnique && "unique",
        ].filter((c): c is string => Boolean(c));
        lines.push(
          `  ${quoteIdent(field.name)}: ${comments.length > 0 ? ' "' + comments.join(" ") + '"' : ""}${constraints.length > 0 ? " {constraint:" + (constraints.length > 1 ? "[" + constraints.join(",") + "]" : constraints.join(", ")) + "}" : ""}`,
        );
      }
      lines.push("}");
      lines.push("");
    }

    lines.push("# Relationships");
    for (const rel of model.relations) {
      // A D2 Ref requires a real table.column on both sides — skip
      // relations we can't resolve columns for (e.g. an implicit
      // many-to-many join table isn't a modeled entity) rather than emit
      // a bare "TableA <-> TableB", which isn't valid D2.
      if (!rel.fromColumn || !rel.toColumn) continue;

      // D2 has no inline cardinality symbol like Mermaid/DBML — crow's-foot
      // notation is set via arrowhead shapes on the connection. `from` is
      // the "one" side and `to` is the "many"/FK-holding side (see
      // Relation.type in core/model.ts).
      const sourceShape = rel.type === "n-n" ? "cf-many" : "cf-one";
      const targetShape = rel.type === "1-1" ? "cf-one" : "cf-many";
      const label = rel.fieldName ? `: ${rel.fieldName}` : "";
      const source = `${quoteIdent(rel.from)}.${quoteIdent(rel.fromColumn)}`;
      const target = `${quoteIdent(rel.to)}.${quoteIdent(rel.toColumn)}`;
      lines.push(
        `${source} <-> ${target}${label} {`,
        `  source-arrowhead.shape: ${sourceShape}`,
        `  target-arrowhead.shape: ${targetShape}`,
        `}`,
      );
    }

    return lines.join("\n");
  },
};
