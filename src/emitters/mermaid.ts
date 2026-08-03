import type { Emitter } from "./types";
import { relationLabel } from "./label";
import { compositeUniqueMates } from "./uniques";
import { buildNameResolver } from "./names";

export const mermaidEmitter: Emitter = {
  format: "mermaid",
  fileExtension: "mmd",
  emit(model, options) {
    const {
      typeMode,
      nameMode = "model",
      relationLabelMode = "both",
    } = options;
    const names = buildNameResolver(model, nameMode);

    const lines = ["erDiagram", "", "  %% Entities"];

    for (const entity of model.entities) {
      if (entity.description) {
        lines.push(`  %% ${entity.description}`);
      }
      const entityId = names.entityId(entity.name);
      const entityAlias = names.entityAlias(entity.name);
      lines.push(
        entityAlias ? `  ${entityId}["${entityAlias}"] {` : `  ${entityId} {`,
      );
      for (const field of entity.fields) {
        const displayType =
          typeMode === "native" ? field.nativeType : field.type;
        const typeLabel = `${displayType}${field.isList ? "[]" : ""}${field.isNullable ? "?" : ""}`;
        const uniqueMates = compositeUniqueMates(entity, field);
        const constraints = [
          field.isPrimaryKey && "PK",
          field.isForeignKey && "FK",
          (field.isUnique || uniqueMates) && "UK",
        ].filter((c): c is string => Boolean(c));
        const fieldAlias = names.fieldAlias(field);
        const comments = [
          field.enumValues && "enum: " + field.enumValues.join(", "),
          field.defaultValue &&
            "default: " + field.defaultValue.replaceAll('"', "'"),
          uniqueMates &&
            uniqueMates.length > 0 &&
            "unique with: " +
              uniqueMates
                .map((mate) => names.fieldIdByName(entity, mate))
                .join(", "),
          fieldAlias && "alias: " + fieldAlias,
          field.description && field.description.replaceAll('"', "'"),
        ].filter((c): c is string => Boolean(c));
        lines.push(
          `    ${typeLabel} ${names.fieldId(field)}${constraints.length > 0 ? " " + constraints.join(", ") : ""}${comments.length > 0 ? ' "' + comments.join(" | ") + '"' : ""}`,
        );
      }
      lines.push("  }");
      lines.push("");
    }

    lines.push("  %% Relationships");
    for (const rel of model.relations) {
      // Mermaid's crow's-foot notation: ||--o{ = one-to-many, }o--o{ =
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

    return lines.join("\n");
  },
};
