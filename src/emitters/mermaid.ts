import type { Emitter } from "./types";

export const mermaidEmitter: Emitter = {
  format: "mermaid",
  fileExtension: "mmd",
  emit(model, options) {
    const { typeMode } = options;

    const lines = ["erDiagram", "", "%% Entities"];

    for (const entity of model.entities) {
      lines.push(`  ${entity.name} {`);
      for (const field of entity.fields) {
        const displayType =
          typeMode === "native" ? field.nativeType : field.type;
        const typeLabel = `${displayType}${field.isList ? "[]" : ""}${field.isNullable ? "?" : ""}`;
        const constraints = [
          field.isPrimaryKey && "PK",
          field.isForeignKey && "FK",
          field.isUnique && "UK",
        ].filter((c): c is string => Boolean(c));
        const comments = [
          field.enumValues && "enum: " + field.enumValues.join(", "),
          field.defaultValue && "default: " + field.defaultValue,
        ].filter((c): c is string => Boolean(c));
        lines.push(
          `    ${typeLabel} ${field.name}${constraints.length > 0 ? " " + constraints.join(", ") : ""}${comments.length > 0 ? ' "' + comments.join(" | ") + '"' : ""}`,
        );
      }
      lines.push("  }");
      lines.push("");
    }

    lines.push("%% Relationships");
    for (const rel of model.relations) {
      // Mermaid's crow's-foot notation: ||--o{ = one-to-many, }o--o{ =
      // many-to-many, ||--|| = one-to-one.
      const symbol =
        rel.type === "1-n"
          ? "||--o{"
          : rel.type === "n-n"
            ? "}o--o{"
            : "||--||";
      lines.push(
        `  ${rel.from} ${symbol} ${rel.to} : "${rel.fieldName ?? ""}"`,
      );
    }

    return lines.join("\n");
  },
};
