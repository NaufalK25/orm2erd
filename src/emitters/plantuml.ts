import type { Emitter } from "./types";

export const plantumlEmitter: Emitter = {
  format: "plantuml",
  fileExtension: "puml",
  emit(model, options) {
    const { typeMode } = options;

    const lines = [
      "@startuml",
      "hide circle",
      "skinparam linetype ortho",
      "",
      "' Entities",
    ];

    for (const entity of model.entities) {
      lines.push(`entity ${entity.name} {`);

      const renderField = (field: (typeof entity.fields)[number]) => {
        let displayType = typeMode === "native" ? field.nativeType : field.type;
        if (field.type === "enum") {
          displayType = `enum(${field.enumValues?.join(", ")})`;
        }
        const typeLabel = `${displayType}${field.isList ? "[]" : ""}`;
        const constraints = [
          field.isForeignKey && "FK",
          field.isUnique && "unique",
        ].filter((c): c is string => Boolean(c));
        const extras = [
          constraints.length > 0 && `<<${constraints.join(", ")}>>`,
          field.defaultValue && ` = ${field.defaultValue}`,
          field.description && `-- ${field.description}`,
        ].filter((c): c is string => Boolean(c));
        const marker = field.isPrimaryKey || !field.isNullable ? "* " : "";
        lines.push(
          `  ${marker}${field.name} : ${typeLabel}${extras.length > 0 ? " " + extras.join(", ") : ""}`,
        );
      };

      const primaryFields = entity.fields.filter((f) => f.isPrimaryKey);
      const otherFields = entity.fields.filter((f) => !f.isPrimaryKey);

      primaryFields.forEach(renderField);
      if (primaryFields.length > 0 && otherFields.length > 0) {
        lines.push("  --");
      }
      otherFields.forEach(renderField);

      lines.push("}");
      if (entity.description) {
        lines.push(`note bottom of ${entity.name} : ${entity.description}`);
      }
      lines.push("");
    }

    lines.push("' Relationships");
    for (const rel of model.relations) {
      // Plantuml's crow's-foot notation: ||--o{ = one-to-many, }o--o{ =
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

    lines.push("@enduml");

    return lines.join("\n");
  },
};
