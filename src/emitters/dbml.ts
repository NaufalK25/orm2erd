import type { Emitter } from "./types";

export const dbmlEmitter: Emitter = {
  format: "dbml",
  fileExtension: "dbml",
  emit(model, options) {
    const { typeMode } = options;

    const lines = [];
    const enumsByName = new Map<string, string[]>();

    for (const entity of model.entities) {
      lines.push(`Table ${entity.name} {`);
      for (const field of entity.fields) {
        const displayType =
          typeMode === "native" ||
          (field.enumValues && field.enumValues.length > 0)
            ? field.nativeType
            : field.type;
        const typeLabel = `${displayType}${field.isList ? "[]" : ""}`;
        const defaultValueDisplay = field.defaultValue
          ? typeof field.defaultValue === "string"
            ? `"${field.defaultValue}"`
            : field.defaultValue
          : undefined;
        const constraints = [
          field.isPrimaryKey && "pk",
          field.isUnique && "unique",
          !field.isNullable && "not null",
          field.defaultValue && "default: " + defaultValueDisplay,
        ].filter((c): c is string => Boolean(c));
        lines.push(
          `  ${field.name} ${typeLabel}${constraints.length > 0 ? " [" + constraints.join(", ") + "]" : ""}`,
        );

        if (field.enumValues && field.enumValues.length > 0) {
          enumsByName.set(field.nativeType, field.enumValues);
        }
      }
      lines.push("  }");
    }

    for (const rel of model.relations) {
      // A DBML Ref requires a real table.column on both sides — skip
      // relations we can't resolve columns for (e.g. an implicit
      // many-to-many join table isn't a modeled entity) rather than emit
      // a bare "Ref: TableA <> TableB", which isn't valid DBML.
      if (!rel.fromColumn || !rel.toColumn) continue;

      // Dbml's ref notation: > = one-to-many, <> =
      // many-to-many, - = one-to-one.
      const symbol = rel.type === "1-n" ? ">" : rel.type === "n-n" ? "<>" : "-";
      lines.push(
        `Ref: ${rel.from}.${rel.fromColumn} ${symbol} ${rel.to}.${rel.toColumn}`,
      );
    }

    for (const [name, values] of enumsByName) {
      lines.push(`Enum ${name} {`);
      for (const value of values) {
        lines.push(`  "${value}"`);
      }
      lines.push(`}`);
    }

    return lines.join("\n");
  },
};
