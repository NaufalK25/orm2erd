export type OutputFormat =
  | "mermaid"
  | "dbml"
  | "plantuml"
  | "d2"
  | "nomnoml"
  | "quickdbd"
  | "graphvizdot";

export type TypeMode = "canonical" | "native";

/**
 * How entity/field identifiers are displayed: the ORM's own model/field
 * names, the physical table/column names, or both together.
 */
export type NameMode = "model" | "table" | "both";

/**
 * How a relation's edge label is built from `Relation.fieldName` (the
 * association alias) and `Relation.toColumn` (the FK column).
 */
export type RelationLabelMode = "alias" | "column" | "both";

/**
 * Letter-casing applied to rendered *identifiers* (entity/field/enum-type
 * names) — never to type labels, enum member values, or the `--names both`
 * alias. `"preserve"` (default) keeps whatever casing the source ORM/DB
 * already uses.
 */
export type CaseMode =
  | "preserve"
  | "snake"
  | "screaming_snake"
  | "camel"
  | "pascal"
  | "kebab"
  | "title"
  | "lower"
  | "upper";
