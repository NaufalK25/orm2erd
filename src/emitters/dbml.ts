import type { Emitter } from "./types";
import { buildNameResolver } from "./names";

export const dbmlEmitter: Emitter = {
  format: "dbml",
  fileExtension: "dbml",
  emit(model, options) {
    const { typeMode, nameMode = "model" } = options;
    const names = buildNameResolver(model, nameMode);

    const lines = ["// Entities"];
    const enumsByName = new Map<string, string[]>();

    for (const entity of model.entities) {
      const entityAlias = names.entityAlias(entity.name);
      // DBML has no table-display-alias syntax, unlike Mermaid/PlantUML/D2 —
      // the model name goes in a plain comment above the table instead.
      if (entityAlias) lines.push(`// ${entityAlias}`);
      lines.push(`Table ${names.entityId(entity.name)} {`);
      // Composite PK members are declared once in the `indexes` block below;
      // also tagging each field `[pk]` would double-define the primary key.
      const compositePkMembers = new Set(entity.primaryKey ?? []);
      for (const field of entity.fields) {
        const displayType =
          typeMode === "native" ||
          (field.enumValues && field.enumValues.length > 0)
            ? field.nativeType
            : field.type;
        const typeLabel = `${displayType}${field.isList ? "[]" : ""}`;
        const defaultValueDisplay = field.defaultValue
          ? `"${field.defaultValue.replaceAll('"', "'")}"`
          : undefined;
        const fieldAlias = names.fieldAlias(field);
        // DBML's field settings only support one `note:` attribute —
        // fold the alias and the description into it rather than
        // emitting two, which DBML would silently let the last one win.
        const noteParts = [
          fieldAlias && `alias: ${fieldAlias}`,
          field.description,
        ].filter((p): p is string => Boolean(p));
        const constraints = [
          field.isPrimaryKey && !compositePkMembers.has(field.name) && "pk",
          field.isUnique && "unique",
          !field.isNullable && "not null",
          field.defaultValue && "default: " + defaultValueDisplay,
          noteParts.length > 0 &&
            `note: "${noteParts.join(" | ").replaceAll('"', "'")}"`,
        ].filter((c): c is string => Boolean(c));
        lines.push(
          `  ${names.fieldId(field)} ${typeLabel}${constraints.length > 0 ? " [" + constraints.join(", ") + "]" : ""}`,
        );

        if (field.enumValues && field.enumValues.length > 0) {
          enumsByName.set(field.nativeType, field.enumValues);
        }
      }

      // entity.primaryKey/uniques/indexes are always keyed by attribute
      // (model-level) name, never physical column name — resolve each
      // through the same map the field declarations above used, so a
      // composite key doesn't silently keep model names under --names table.
      const resolveNames = (fields: string[]) =>
        fields.map((f) => names.fieldIdByName(entity, f));

      // Composite PK / multi-column uniques / plain indexes → DBML native
      // indexes block. A single-column index is a bare field name; multiple
      // columns are wrapped in parens — both accept the same `[...]` attrs.
      const indexLines = [
        entity.primaryKey &&
          `    (${resolveNames(entity.primaryKey).join(", ")}) [pk]`,
        ...(entity.uniques ?? []).map(
          (cols) => `    (${resolveNames(cols).join(", ")}) [unique]`,
        ),
        ...(entity.indexes ?? []).map((idx) => {
          const resolvedFields = resolveNames(idx.fields);
          const columns =
            resolvedFields.length > 1
              ? `(${resolvedFields.join(", ")})`
              : resolvedFields[0];
          const attrs = [
            idx.isUnique && "unique",
            idx.name && `name: "${idx.name.replaceAll('"', "'")}"`,
          ].filter((a): a is string => Boolean(a));
          return `    ${columns}${attrs.length > 0 ? " [" + attrs.join(", ") + "]" : ""}`;
        }),
      ].filter((l): l is string => Boolean(l));
      if (indexLines.length > 0) {
        lines.push("", "  indexes {", ...indexLines, "  }");
      }

      if (entity.description) {
        lines.push(`  Note: "${entity.description.replaceAll('"', "'")}"`);
      }

      lines.push("}");
      lines.push("");
    }

    lines.push("// Relationships");
    for (const rel of model.relations) {
      // A DBML Ref requires a real table.column on both sides — skip
      // relations we can't resolve columns for (e.g. an implicit
      // many-to-many join table isn't a modeled entity) rather than emit
      // a bare "Ref: TableA <> TableB", which isn't valid DBML.
      if (!rel.fromColumn || !rel.toColumn) continue;

      // Dbml's ref notation: > = one-to-many, <> =
      // many-to-many, - = one-to-one.
      const symbol = rel.type === "1-n" ? ">" : rel.type === "n-n" ? "<>" : "-";
      // DBML's action names are already the IR's own canonical spelling
      // ("cascade", "set null", ...) — no translation needed.
      const actions = [
        rel.onDelete && `delete: ${rel.onDelete}`,
        rel.onUpdate && `update: ${rel.onUpdate}`,
      ].filter((a): a is string => Boolean(a));
      const fromEntity = model.entities.find((e) => e.name === rel.from);
      const toEntity = model.entities.find((e) => e.name === rel.to);
      const fromColumnId = fromEntity
        ? names.fieldIdByName(fromEntity, rel.fromColumn)
        : rel.fromColumn;
      const toColumnId = toEntity
        ? names.fieldIdByName(toEntity, rel.toColumn)
        : rel.toColumn;
      lines.push(
        `Ref: ${names.entityId(rel.from)}.${fromColumnId} ${symbol} ${names.entityId(rel.to)}.${toColumnId}${actions.length > 0 ? " [" + actions.join(", ") + "]" : ""}`,
      );
    }

    if (enumsByName.size > 0) {
      // The relations loop above always pushes "// Relationships" as a
      // header first (even with zero relations), so the last line here is
      // never already blank.
      lines.push("", "// Enums");
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
