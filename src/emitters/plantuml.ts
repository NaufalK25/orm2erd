import type { Emitter } from "./types";
import { relationLabel } from "./label";
import { compositeUniqueMates } from "./uniques";
import { buildNameResolver } from "./names";

export const plantumlEmitter: Emitter = {
  format: "plantuml",
  fileExtension: "puml",
  emit(model, options) {
    const {
      typeMode,
      nameMode = "model",
      relationLabelMode = "both",
    } = options;
    const names = buildNameResolver(model, nameMode);

    const lines = [
      "@startuml",
      "hide circle",
      "skinparam linetype ortho",
      "",
      "' Entities",
    ];

    for (const entity of model.entities) {
      const entityId = names.entityId(entity.name);
      const entityAlias = names.entityAlias(entity.name);
      lines.push(
        entityAlias
          ? `entity ${entityId} as "${entityAlias}" {`
          : `entity ${entityId} {`,
      );

      const renderField = (field: (typeof entity.fields)[number]) => {
        let displayType = typeMode === "native" ? field.nativeType : field.type;
        if (field.type === "enum") {
          displayType = `enum(${field.enumValues?.join(", ")})`;
        }
        const typeLabel = `${displayType}${field.isList ? "[]" : ""}`;
        const uniqueMates = compositeUniqueMates(entity, field);
        const constraints = [
          field.isForeignKey && "FK",
          (field.isUnique || uniqueMates) && "unique",
        ].filter((c): c is string => Boolean(c));
        const fieldAlias = names.fieldAlias(field);
        const extras = [
          constraints.length > 0 && `<<${constraints.join(", ")}>>`,
          field.defaultValue && ` = ${field.defaultValue}`,
          uniqueMates &&
            uniqueMates.length > 0 &&
            `-- unique with: ${uniqueMates.map((mate) => names.fieldIdByName(entity, mate)).join(", ")}`,
          fieldAlias && `-- alias: ${fieldAlias}`,
          field.description && `-- ${field.description}`,
        ].filter((c): c is string => Boolean(c));
        const marker = field.isPrimaryKey || !field.isNullable ? "* " : "";
        lines.push(
          `  ${marker}${names.fieldId(field)} : ${typeLabel}${extras.length > 0 ? " " + extras.join(", ") : ""}`,
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
        lines.push(`note bottom of ${entityId} : ${entity.description}`);
      }
      lines.push("");
    }

    lines.push("' Relationships");
    for (const rel of model.relations) {
      // Plantuml's crow's-foot notation: ||--o{ = one-to-many, }o--o{ =
      // many-to-many, ||--o| = one-to-one. The `to` end is always
      // optional (`o`) — nothing in a FK model forces a parent row to
      // have a matching row on the FK-holding side. The `from` end's
      // marker varies: `||` (exactly one) unless isFromOptional says the
      // FK column is nullable, in which case it downgrades to `|o`.
      const fromMarker = rel.isFromOptional ? "|o" : "||";
      const symbol =
        rel.type === "1-n"
          ? `${fromMarker}--o{`
          : rel.type === "n-n"
            ? "}o--o{"
            : `${fromMarker}--o|`;
      lines.push(
        `  ${names.entityId(rel.from)} ${symbol} ${names.entityId(rel.to)} : "${relationLabel(rel, relationLabelMode)}"`,
      );
    }

    lines.push("@enduml");

    return lines.join("\n");
  },
};
