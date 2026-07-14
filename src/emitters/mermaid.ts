import type { Emitter } from "./types";

export const mermaidEmitter: Emitter = {
  format: "mermaid",
  fileExtension: "mermaid",
  emit(model) {
    const lines = ["erDiagram"];

    for (const entity of model.entities) {
      lines.push(`  ${entity.name} {`);
      for (const field of entity.fields) {
        const typeLabel = `${field.type}${field.isList ? "[]" : ""}${field.isNullable ? "?" : ""}`;
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
    }

    for (const rel of model.relations) {
      const symbol =
        rel.type === "1-n" ? "||--o{" : rel.type === "n-n" ? "}o--o{" : "||--||";
      lines.push(
        `  ${rel.from} ${symbol} ${rel.to} : "${rel.fieldName ?? ""}"`,
      );
    }

    return lines.join("\n");
  },
};
