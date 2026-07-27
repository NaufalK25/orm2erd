// Local shapes for the drizzle-orm runtime metadata this adapter reads. Not
// imported from `drizzle-orm` itself for TYPES — every value at runtime is
// obtained via the TARGET project's own installed copy (see
// `requireFromTarget` in index.ts), the same "use the target's own install"
// approach the TypeORM adapter takes for its internal metadata builder.
// Unlike TypeORM's private internals though, everything read here
// (`is`, `getTableConfig`, the per-dialect `*Table`/`*Dialect` classes) is
// drizzle-orm's own public, documented API surface — the same surface
// drizzle-kit itself is built on (verified against its compiled CLI).

export type DrizzleDialectName =
  "postgresql" | "mysql" | "sqlite" | "turso" | "singlestore" | "gel";

// Mirrors the subset of drizzle-kit's `Config` type (index.d.ts) this
// adapter reads. `defineConfig()` is an identity function, so a config file
// can be imported directly without ever touching the `drizzle-kit` package.
export interface DrizzleKitConfig {
  dialect: DrizzleDialectName;
  schema?: string | string[];
  casing?: "camelCase" | "snake_case";
}

// Mirrors `Column` (column.ts), trimmed to what this adapter reads.
export interface DrizzleColumn {
  name: string;
  keyAsName: boolean;
  primary: boolean;
  notNull: boolean;
  default?: unknown;
  isUnique: boolean;
  dataType: string;
  columnType: string;
  enumValues?: string[];
  getSQLType(): string;
}

// Mirrors the object returned by a `ForeignKey`'s `.reference()` (e.g.
// pg-core/foreign-keys.ts's `Reference` type).
export interface DrizzleReference {
  name?: string;
  columns: DrizzleColumn[];
  foreignTable: unknown;
  foreignColumns: DrizzleColumn[];
}

// Mirrors `ForeignKey` (e.g. pg-core/foreign-keys.ts). `onUpdate`/`onDelete`
// use the literal union `'cascade' | 'restrict' | 'no action' | 'set null' |
// 'set default'` — identical across every dialect's `UpdateDeleteAction`,
// and identical to this project's own `RelationAction`, so no mapping table
// is needed (unlike the Sequelize/TypeORM adapters).
export interface DrizzleForeignKey {
  reference(): DrizzleReference;
  onUpdate?: string;
  onDelete?: string;
}

// Mirrors `PrimaryKey` (e.g. pg-core/primary-keys.ts) — only ever present
// here for a table-level composite `primaryKey({ columns: [...] })`
// declaration; a single-column `.primaryKey()` on a column builder instead
// just sets that column's own `.primary` directly and never appears here.
export interface DrizzlePrimaryKey {
  columns: DrizzleColumn[];
}

// Mirrors `UniqueConstraint` (e.g. pg-core/unique-constraint.ts).
export interface DrizzleUniqueConstraint {
  columns: DrizzleColumn[];
}

// Mirrors `Index` (e.g. pg-core/indexes.ts). A column entry can also be a
// raw `SQL` expression (functional index) rather than an actual column —
// checked via `is(value, SQL)` at the call site, not representable here.
export interface DrizzleIndex {
  config: {
    name?: string;
    columns: unknown[];
    unique: boolean;
  };
}

// Mirrors the object `getTableConfig()` returns (e.g. pg-core/utils.ts),
// trimmed to the fields shared across every dialect's version of it.
// `foreignKeys` is genuinely absent (not just empty) for singlestore-core's
// version — SingleStore, being a distributed DB, has no FK constraint
// concept at all — so every reader treats it as optional.
export interface DrizzleTableConfig {
  name: string;
  columns: DrizzleColumn[];
  indexes: DrizzleIndex[];
  foreignKeys?: DrizzleForeignKey[];
  primaryKeys: DrizzlePrimaryKey[];
  uniqueConstraints: DrizzleUniqueConstraint[];
}

// Mirrors the small, stable subset of a dialect core package's exports
// (e.g. `drizzle-orm/pg-core`) this adapter needs — the table class, and
// `getTableConfig`. The dialect class (`PgDialect`/`MySqlDialect`/...) is
// looked up separately by name, since its constructor signature is uniform
// across dialects but its export name isn't.
export interface DrizzleDialectModule {
  getTableConfig(table: unknown): DrizzleTableConfig;
  [exportName: string]: unknown;
}

// Mirrors the relevant exports of the `drizzle-orm` root package.
export interface DrizzleOrmModule {
  is(value: unknown, type: unknown): boolean;
  SQL: unknown;
  getTableName(table: unknown): string;
}

// Mirrors `drizzle-orm/casing`'s exports, used to resolve a column's actual
// DB name when a table-/db-level `casing` strategy is configured and the
// column itself only has a JS property name (`keyAsName`).
export interface DrizzleCasingModule {
  toCamelCase(value: string): string;
  toSnakeCase(value: string): string;
}

// The minimal `PgDialect`/`MySqlDialect`/`SQLiteSyncDialect`/
// `SingleStoreDialect` surface this adapter uses — resolving raw `SQL`
// defaults and functional-index expressions to displayable text, without a
// live DB connection.
export interface DrizzleDialectInstance {
  sqlToQuery(sql: unknown, invokeSource?: "indexes"): { sql: string };
}
