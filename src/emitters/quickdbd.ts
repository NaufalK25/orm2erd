import type { Emitter } from "./types";
import type { Relation } from "../core/model";
import { buildNameResolver } from "./names";

interface InlineFk {
  symbol: string;
  refEntity: string;
  refColumn: string;
}

// QuickDBD has no separate relationship section — the FK marker sits
// inline on whichever field physically holds the FK column. The FK
// always lives on `to` (see Relation in core/model.ts). n-n relations
// never get fromColumn/toColumn resolved, so they're skipped same as
// dbml/d2 do for their Ref sections.
function buildInlineFkMap(relations: Relation[]): Map<string, InlineFk> {
  const map = new Map<string, InlineFk>();
  for (const rel of relations) {
    if (!rel.fromColumn || !rel.toColumn) continue;

    const symbol = rel.type === "1-n" ? ">-" : "-";
    map.set(`${rel.to}.${rel.toColumn}`, {
      symbol,
      refEntity: rel.from,
      refColumn: rel.fromColumn,
    });
  }
  return map;
}

export const quickdbdEmitter: Emitter = {
  format: "quickdbd",
  fileExtension: "txt",
  emit(model, options) {
    const { typeMode, nameMode = "model" } = options;
    // quickdbd has no entity alias syntax, so "both" mode falls back to the
    // physical identifier alone, same as "table" mode.
    const names = buildNameResolver(model, nameMode);
    const inlineFks = buildInlineFkMap(model.relations);
    const entityByName = new Map(model.entities.map((e) => [e.name, e]));

    const lines = ["# Entities"];

    for (const entity of model.entities) {
      lines.push(`${names.entityId(entity.name)}`, "--");
      for (const field of entity.fields) {
        let displayType = typeMode === "native" ? field.nativeType : field.type;
        if (field.type === "enum") {
          displayType = "Enum";
        }
        const typeLabel = `${displayType}${field.isList ? "[]" : ""}`;

        // buildInlineFkMap's keys/values are attribute (model-level) names —
        // the same convention as entity.primaryKey/uniques — so the lookup
        // key stays raw while only the displayed reference is resolved.
        const fk = inlineFks.get(`${entity.name}.${field.name}`);
        const refEntity = fk ? entityByName.get(fk.refEntity) : undefined;
        const fkToken = fk
          ? `FK ${fk.symbol} ${names.entityId(fk.refEntity)}.${refEntity ? names.fieldIdByName(refEntity, fk.refColumn) : fk.refColumn}`
          : field.isForeignKey && "FK";

        const fieldAlias = names.fieldAlias(field);
        const constraints = [
          field.isPrimaryKey && "PK",
          field.isUnique && "UNIQUE",
          field.isNullable && "NULL",
          fkToken,
        ].filter((c): c is string => Boolean(c));

        const comments = [
          field.enumValues && `enum: ${field.enumValues.join(", ")}`,
          field.defaultValue &&
            `default: ${field.defaultValue.replaceAll('"', "'")}`,
          fieldAlias && `alias: ${fieldAlias}`,
        ].filter((c): c is string => Boolean(c));

        const line = `${names.fieldId(field)} ${typeLabel}${constraints.length > 0 ? " " + constraints.join(" ") : ""}`;
        lines.push(
          comments.length > 0 ? `${line} # ${comments.join(" | ")}` : line,
        );
      }
      lines.push("");
    }

    return lines.join("\n");
  },
};
