import type { Emitter } from "./types";
import { resolveRelationLabel } from "./label";
import { compositeUniqueMates } from "./uniques";
import { buildNameResolver } from "./names";

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
    const {
      typeMode,
      nameMode = "model",
      relationLabelMode = "both",
      caseMode = "preserve",
      inflectMode = "preserve",
    } = options;
    const names = buildNameResolver(model, nameMode, caseMode, inflectMode);

    const lines = ["# Entities"];

    for (const entity of model.entities) {
      const entityId = names.entityId(entity.name);
      const entityAlias = names.entityAlias(entity.name);
      lines.push(
        `${quoteIdent(entityId)}: ${entityAlias ? quoteIdent(entityAlias) + " " : ""}{`,
        "  shape: sql_table",
      );
      for (const field of entity.fields) {
        let displayType = typeMode === "native" ? field.nativeType : field.type;
        if (field.type === "enum") {
          displayType = `enum(${field.enumValues?.join(", ")})`;
        }
        const typeLabel = `${displayType}${field.isList ? "[]" : ""}`;
        const defaultValueDisplay = field.defaultValue
          ? field.defaultValue.replaceAll('"', "'")
          : undefined;
        const uniqueMates = compositeUniqueMates(entity, field);
        const fieldAlias = names.fieldAlias(field);
        const comments = [
          typeLabel,
          !field.isNullable && "NOT NULL",
          field.defaultValue && `DEFAULT ${defaultValueDisplay}`,
          uniqueMates &&
            uniqueMates.length > 0 &&
            `unique with: ${uniqueMates.map((mate) => names.fieldIdByName(entity, mate)).join(", ")}`,
          fieldAlias && `alias: ${fieldAlias}`,
        ].filter((c): c is string => Boolean(c));
        const constraints = [
          field.isPrimaryKey && "pk",
          field.isForeignKey && "fk",
          (field.isUnique || uniqueMates) && "unique",
        ].filter((c): c is string => Boolean(c));
        lines.push(
          `  ${quoteIdent(names.fieldId(field))}: ${comments.length > 0 ? ' "' + comments.join(" ") + '"' : ""}${constraints.length > 0 ? " {constraint:" + (constraints.length > 1 ? "[" + constraints.join(",") + "]" : constraints.join(", ")) + "}" : ""}`,
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
      // Relation.type in core/model.ts). D2's `cf-one` already means
      // zero-or-one; the required form is `cf-one-required`. `to` stays
      // plain `cf-one`/`cf-many` unconditionally — nothing in a FK model
      // forces a parent row to have a matching row on the FK-holding
      // side — while `from`'s shape varies with isFromOptional.
      const sourceShape =
        rel.type === "n-n"
          ? "cf-many"
          : rel.isFromOptional
            ? "cf-one"
            : "cf-one-required";
      const targetShape = rel.type === "1-1" ? "cf-one" : "cf-many";
      const resolvedLabel = resolveRelationLabel(
        model,
        rel,
        names,
        relationLabelMode,
      );
      const label = resolvedLabel ? `: ${resolvedLabel}` : "";
      // fromColumn/toColumn are attribute (model-level) names, same as
      // entity.primaryKey/uniques — resolve them the same way so the
      // reference matches the field identifier declared above, rather than
      // dangling on a model name that "table"/"both" mode no longer emits.
      const fromEntity = model.entities.find((e) => e.name === rel.from);
      const toEntity = model.entities.find((e) => e.name === rel.to);
      const fromColumnId = fromEntity
        ? names.fieldIdByName(fromEntity, rel.fromColumn)
        : rel.fromColumn;
      const toColumnId = toEntity
        ? names.fieldIdByName(toEntity, rel.toColumn)
        : rel.toColumn;
      const source = `${quoteIdent(names.entityId(rel.from))}.${quoteIdent(fromColumnId)}`;
      const target = `${quoteIdent(names.entityId(rel.to))}.${quoteIdent(toColumnId)}`;
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
