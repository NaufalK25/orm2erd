import type { Emitter } from "./types";

export const nomnomlEmitter: Emitter = {
  format: "nomnoml",
  fileExtension: "noml",
  emit(model, options) {
    const { typeMode } = options;

    const lines = ["#direction: right", "", "// Entities"];

    for (const entity of model.entities) {
      lines.push(`[<table> ${entity.name}|`);
      entity.fields.forEach((field, index) => {
        let displayType = typeMode === "native" ? field.nativeType : field.type;
        if (field.type === "enum") {
          displayType = `enum(${field.enumValues?.join(", ")})`;
        }
        const typeLabel = `${displayType}${field.isList ? "\\[\\]" : ""}`;
        const constraints = [
          field.isPrimaryKey && "PK",
          field.isForeignKey && "FK",
          field.isUnique && "unique",
          !field.isNullable && "NN",
        ].filter((c): c is string => Boolean(c));
        const comments = [
          typeLabel,
          constraints.length > 0 && constraints.join(", "),
          field.defaultValue && "= " + field.defaultValue.replaceAll('"', "'"),
        ].filter((c): c is string => Boolean(c));
        const isLastField = index === entity.fields.length - 1;
        lines.push(
          `  ${field.name} | ${comments.join(" ")}${isLastField ? "" : " ||"}`,
        );
      });
      lines.push("]");
      lines.push("");
    }

    lines.push("// Relationships");
    for (const rel of model.relations) {
      // nomnoml's notation: 1 -- * = one-to-many, * -- * =
      // many-to-many, 1 -- 1 = one-to-one.
      const symbol =
        rel.type === "1-n"
          ? "1 -- *"
          : rel.type === "n-n"
            ? "* -- *"
            : "1 -- 1";
      lines.push(`[${rel.from}] ${symbol} [${rel.to}]`);
    }

    return lines.join("\n");
  },
};
