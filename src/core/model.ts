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
  /** Free-text doc comment, e.g. Prisma's `///`, Sequelize's `comment`, TypeORM's `@Column({ comment })`. */
  description?: string;
}

export interface Index {
  fields: string[];
  isUnique?: boolean;
  name?: string;
}

export type RelationAction =
  "cascade" | "restrict" | "set null" | "no action" | "set default";

export interface Entity {
  name: string;
  fields: Field[];
  /** Free-text doc comment, e.g. Prisma's `///`, Sequelize's `comment`, TypeORM's `@Entity({ comment })`. */
  description?: string;
  // Composite key metadata. Single-column keys/uniques stay expressed via
  // the per-field `isPrimaryKey`/`isUnique` booleans; these arrays carry
  // only the multi-column groupings that a per-field boolean can't express.
  /** Ordered member columns, set only when the PK is composite (length > 1). */
  primaryKey?: string[];
  /** Each inner array is one multi-column unique constraint (length > 1). */
  uniques?: string[][];
  // Non-unique indexes (single or multi-column) — uniques stay on
  // `primaryKey`/`uniques`/per-field `isUnique` above; this only carries
  // plain lookup indexes those can't express.
  indexes?: Index[];
}

export interface Relation {
  from: string;
  to: string;
  type: "1-1" | "1-n" | "n-n";
  fieldName?: string;
  // Whether `fromColumn`/`toColumn` land on the FK-holding side or the
  // referenced side isn't fixed by `type` — each adapter works this out
  // per relation (e.g. for 1-n the FK physically lives on `to`, not
  // `from`). See the relation-building logic in each adapter
  // (src/adapters/prisma/index.ts, src/adapters/sequelize/index.ts) for
  // how each one resolves this. Both are omitted when unresolvable, e.g.
  // implicit many-to-many join tables.
  fromColumn?: string;
  toColumn?: string;
  // Referential actions on the FK constraint, when the ORM declares (or, for
  // Sequelize, defaults) one. Only meaningful alongside fromColumn/toColumn.
  onDelete?: RelationAction;
  onUpdate?: RelationAction;
}

export interface ERDModel {
  entities: Entity[];
  relations: Relation[];
}
