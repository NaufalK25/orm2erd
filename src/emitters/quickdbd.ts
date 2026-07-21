import type { Emitter } from "./types";
import type { Relation } from "../core/model";

interface InlineFk {
  symbol: string;
  refEntity: string;
  refColumn: string;
}

// QuickDBD has no separate relationship section — the FK marker sits
// inline on whichever field physically holds the FK column. Which side
// that is flips by relation type (see Relation in core/model.ts): the
// "many" side for 1-n, the adapter-chosen "owner" side for 1-1. n-n
// relations never get fromColumn/toColumn resolved, so they're skipped
// same as dbml/d2 do for their Ref sections.
function buildInlineFkMap(relations: Relation[]): Map<string, InlineFk> {
  const map = new Map<string, InlineFk>();
  for (const rel of relations) {
    if (!rel.fromColumn || !rel.toColumn) continue;

    const [fkEntity, fkColumn, refEntity, refColumn] =
      rel.type === "1-n"
        ? [rel.to, rel.toColumn, rel.from, rel.fromColumn]
        : [rel.from, rel.fromColumn, rel.to, rel.toColumn];

    const symbol = rel.type === "1-n" ? ">-" : "-";
    map.set(`${fkEntity}.${fkColumn}`, { symbol, refEntity, refColumn });
  }
  return map;
}

export const quickdbdEmitter: Emitter = {
  format: "quickdbd",
  fileExtension: "txt",
  emit(model, options) {
    const { typeMode } = options;
    const inlineFks = buildInlineFkMap(model.relations);

    const lines = ["# Entities"];

    for (const entity of model.entities) {
      lines.push(`${entity.name}`, "--");
      for (const field of entity.fields) {
        let displayType = typeMode === "native" ? field.nativeType : field.type;
        if (field.type === "enum") {
          displayType = "Enum";
        }
        const typeLabel = `${displayType}${field.isList ? "[]" : ""}`;

        const fk = inlineFks.get(`${entity.name}.${field.name}`);
        const fkToken = fk
          ? `FK ${fk.symbol} ${fk.refEntity}.${fk.refColumn}`
          : field.isForeignKey && "FK";

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
        ].filter((c): c is string => Boolean(c));

        const line = `${field.name} ${typeLabel}${constraints.length > 0 ? " " + constraints.join(" ") : ""}`;
        lines.push(
          comments.length > 0 ? `${line} # ${comments.join(" | ")}` : line,
        );
      }
      lines.push("");
    }

    return lines.join("\n");
  },
};
