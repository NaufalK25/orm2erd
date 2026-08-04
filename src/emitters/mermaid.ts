import type { Emitter } from "./types";
import { resolveRelationLabel } from "./label";
import { compositeUniqueMates } from "./uniques";
import { buildNameResolver } from "./names";
import { hasSpace } from "./quote";

// Mermaid's erDiagram tolerates a bare hyphen in either an entity or a field
// identifier — only a space forces quoting, and entities/fields each use a
// different quote character: an entity name is quoted with `"..."` (same
// character used for the field-comment string, but never ambiguous since it
// only ever appears right after the entity id, before ` {`/`["alias"] {`),
// a field name with `` `...` ``.
function quoteEntity(id: string): string {
  return hasSpace(id) ? `"${id}"` : id;
}
function quoteField(id: string): string {
  return hasSpace(id) ? `\`${id}\`` : id;
}

export const mermaidEmitter: Emitter = {
  format: "mermaid",
  fileExtension: "mmd",
  emit(model, options) {
    const {
      typeMode,
      nameMode = "model",
      relationLabelMode = "both",
      caseMode = "preserve",
      inflectMode = "preserve",
    } = options;
    const names = buildNameResolver(model, nameMode, caseMode, inflectMode);

    const lines = ["erDiagram", "", "  %% Entities"];

    for (const entity of model.entities) {
      if (entity.description) {
        lines.push(`  %% ${entity.description}`);
      }
      const entityId = quoteEntity(names.entityId(entity.name));
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
          `    ${typeLabel} ${quoteField(names.fieldId(field))}${constraints.length > 0 ? " " + constraints.join(", ") : ""}${comments.length > 0 ? ' "' + comments.join(" | ") + '"' : ""}`,
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
        `  ${quoteEntity(names.entityId(rel.from))} ${symbol} ${quoteEntity(names.entityId(rel.to))} : "${resolveRelationLabel(model, rel, names, relationLabelMode)}"`,
      );
    }

    return lines.join("\n");
  },
};
