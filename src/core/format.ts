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
