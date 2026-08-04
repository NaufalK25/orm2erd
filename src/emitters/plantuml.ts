import type { Emitter } from "./types";
import { resolveRelationLabel } from "./label";
import { compositeUniqueMates } from "./uniques";
import { buildNameResolver } from "./names";
import { hasHyphen, hasSpace } from "./quote";

// Entity names only — never fields, verified empirically (a hyphenated or
// spaced field name renders fine bare). A hyphenated entity name is
// tolerated bare in its own `entity X {` declaration but breaks when
// referenced from a relationship line, so it's quoted everywhere it's used
// (declaration, note, and every relationship reference) rather than relying
// on that inconsistent per-position leniency.
function quoteEntity(id: string): string {
  return hasHyphen(id) || hasSpace(id) ? `"${id}"` : id;
}

export const plantumlEmitter: Emitter = {
  format: "plantuml",
  fileExtension: "puml",
  emit(model, options) {
    const {
      typeMode,
      nameMode = "model",
      relationLabelMode = "both",
      caseMode = "preserve",
      inflectMode = "preserve",
    } = options;
    const names = buildNameResolver(model, nameMode, caseMode, inflectMode);

    const lines = [
      "@startuml",
      "hide circle",
      "skinparam linetype ortho",
      "",
      "' Entities",
    ];

    for (const entity of model.entities) {
      const entityId = quoteEntity(names.entityId(entity.name));
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
        `  ${quoteEntity(names.entityId(rel.from))} ${symbol} ${quoteEntity(names.entityId(rel.to))} : "${resolveRelationLabel(model, rel, names, relationLabelMode)}"`,
      );
    }

    lines.push("@enduml");

    return lines.join("\n");
  },
};
