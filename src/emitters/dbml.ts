import type { Emitter } from "./types";
import { buildNameResolver } from "./names";
import { toCase } from "../core/case-transform";
import { hasHyphen, hasSpace } from "./quote";

// Unlike Mermaid, DBML needs quoting for a bare hyphen too, not just a
// space — verified empirically (`post-tag` alone breaks unquoted). One
// quote character (`"..."`) covers both triggers here.
function quoteIdent(id: string): string {
  return hasHyphen(id) || hasSpace(id) ? `"${id}"` : id;
}

export const dbmlEmitter: Emitter = {
  format: "dbml",
  fileExtension: "dbml",
  emit(model, options) {
    const { typeMode, nameMode = "model", caseMode = "preserve" } = options;
    const names = buildNameResolver(model, nameMode, caseMode);

    const lines = ["// Entities"];
    const enumsByName = new Map<string, string[]>();

    for (const entity of model.entities) {
      const entityAlias = names.entityAlias(entity.name);
      // DBML has no table-display-alias syntax, unlike Mermaid/PlantUML/D2 —
      // the model name goes in a plain comment above the table instead.
      if (entityAlias) lines.push(`// ${entityAlias}`);
      lines.push(`Table ${quoteIdent(names.entityId(entity.name))} {`);
      // Composite PK members are declared once in the `indexes` block below;
      // also tagging each field `[pk]` would double-define the primary key.
      const compositePkMembers = new Set(entity.primaryKey ?? []);
      for (const field of entity.fields) {
        const isEnum = Boolean(field.enumValues && field.enumValues.length > 0);
        // An enum's nativeType is a real schema identifier here — it's the
        // name of the `Enum` block declared below and referenced by every
        // field of that type — so it gets case-transformed (and quoted if
        // needed) like any other identifier. Computed once and reused for
        // both the field's type reference below and the `Enum` block header
        // further down, so they can never end up mismatched. A plain native
        // type label (typeMode: "native" on a non-enum field, e.g.
        // "VARCHAR2") is fixed driver vocabulary, not a naming convention,
        // and must never be case-transformed or quoted.
        const enumTypeName = isEnum
          ? quoteIdent(toCase(field.nativeType, caseMode))
          : undefined;
        const displayType =
          enumTypeName ??
          (typeMode === "native" ? field.nativeType : field.type);
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
          `  ${quoteIdent(names.fieldId(field))} ${typeLabel}${constraints.length > 0 ? " [" + constraints.join(", ") + "]" : ""}`,
        );

        if (enumTypeName && field.enumValues) {
          enumsByName.set(enumTypeName, field.enumValues);
        }
      }

      // entity.primaryKey/uniques/indexes are always keyed by attribute
      // (model-level) name, never physical column name — resolve each
      // through the same map the field declarations above used, so a
      // composite key doesn't silently keep model names under --names table.
      const resolveNames = (fields: string[]) =>
        fields.map((f) => quoteIdent(names.fieldIdByName(entity, f)));

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

      // DBML's ref operator reads left-to-right: `<` means the left column
      // is the "one"/unique side and the right is "many" (e.g. `users.id <
      // posts.author_id`); `>` is the mirror (left "many", right "one").
      // `rel.from` is always the one/referenced side and `rel.to` always the
      // many/FK-holding side (see Relation in core/model.ts), so 1-n uses
      // `<` here — using `>` would claim `rel.from` (unique) allows "many",
      // which real DBML tooling flags as invalid.
      const baseSymbol =
        rel.type === "1-n" ? "<" : rel.type === "n-n" ? "<>" : "-";
      // A `?` next to one side means the *other* side doesn't need a match
      // (e.g. `users.id ?< posts.editor_id` = "a post may have no editor").
      // `rel.from` is always written on the left here, so marking it
      // optional (isFromOptional — the FK column on `rel.to` is nullable)
      // means placing `?` immediately before the operator. n-n never sets
      // isFromOptional (see Relation in core/model.ts), so this only ever
      // fires for 1-1/1-n.
      const symbol = rel.isFromOptional ? `?${baseSymbol}` : baseSymbol;
      // DBML's action names are already the IR's own canonical spelling
      // ("cascade", "set null", ...) — no translation needed.
      const actions = [
        rel.onDelete && `delete: ${rel.onDelete}`,
        rel.onUpdate && `update: ${rel.onUpdate}`,
      ].filter((a): a is string => Boolean(a));
      const fromEntity = model.entities.find((e) => e.name === rel.from);
      const toEntity = model.entities.find((e) => e.name === rel.to);
      const fromColumnId = quoteIdent(
        fromEntity
          ? names.fieldIdByName(fromEntity, rel.fromColumn)
          : rel.fromColumn,
      );
      const toColumnId = quoteIdent(
        toEntity ? names.fieldIdByName(toEntity, rel.toColumn) : rel.toColumn,
      );
      lines.push(
        `Ref: ${quoteIdent(names.entityId(rel.from))}.${fromColumnId} ${symbol} ${quoteIdent(names.entityId(rel.to))}.${toColumnId}${actions.length > 0 ? " [" + actions.join(", ") + "]" : ""}`,
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
