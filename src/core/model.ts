export type CanonicalType =
  | "string"
  | "int"
  | "float"
  | "decimal"
  | "boolean"
  | "datetime"
  | "json"
  | "bytes"
  | "bigint"
  | "enum"
  | "unknown";

export interface Field {
  name: string;
  type: CanonicalType;
  /** The ORM's own type name. */
  nativeType: string;
  isList?: boolean;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  isNullable?: boolean;
  isUnique?: boolean;
  defaultValue?: string;
  enumValues?: string[];
}

export interface Entity {
  name: string;
  fields: Field[];
}

export interface Relation {
  from: string;
  to: string;
  type: "1-1" | "1-n" | "n-n";
  fieldName?: string;
}

export interface ERDModel {
  entities: Entity[];
  relations: Relation[];
}
