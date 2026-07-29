// Local shapes for the Sequelize runtime metadata we read. Not imported from
// `sequelize` itself, to avoid a dual-package hazard if the target project
// has its own separate install. Only v6.x is supported (see the version
// check in `extract`, index.ts), so each shape below is trimmed from that
// version's own `.d.ts` files — check those on a real mismatch, not v7's docs.

// Mirrors the instance shape of `sequelize/types/data-types.d.ts`'s
// `ABSTRACT`/`ENUM`/`ARRAY` classes (e.g. `DataTypes.STRING()`,
// `DataTypes.ENUM(...)`, `DataTypes.ARRAY(...)`). `.constructor.name` is the
// DataType's internal class name (e.g. "JSONTYPE" for DataTypes.JSON) and
// doesn't always match its public type key — `.key` (e.g. "JSON") is the
// one that does and should be preferred when present.
export interface SequelizeDataType {
  constructor: { name: string };
  key?: string;
  values?: string[]; // present on DataTypes.ENUM(...) instances
  type?: SequelizeDataType; // present on DataTypes.ARRAY(...) instances — the element type
}

// Mirrors `ModelAttributeColumnOptions` in `sequelize/types/model.d.ts`.
export interface SequelizeAttribute {
  type: SequelizeDataType;
  primaryKey?: boolean;
  allowNull?: boolean;
  unique?: boolean;
  defaultValue?: unknown;
  comment?: string;
  // The physical column name — defaults to the attribute name (or its
  // underscored form) when not set explicitly. `Model.uniqueKeys` groups
  // reference this, not the attribute name, so it's needed to map back.
  field?: string;
  // Only present on a foreign-key attribute — Association#_injectAttributes
  // (belongs-to.js/has-many.js/belongs-to-many.js) always resolves and
  // writes these onto the FK attribute via addForeignKeyConstraints, once
  // per association unless `constraints: false` was set, defaulting
  // unspecified onDelete to "SET NULL"/"CASCADE" depending on nullability.
  onDelete?: string;
  onUpdate?: string;
  // Same addForeignKeyConstraints call that writes onDelete/onUpdate above
  // also writes this — the authoritative "this column is a FK" marker,
  // independent of which side (BelongsTo vs HasMany/HasOne/BelongsToMany)
  // declared the association. Shape is `{ model, key }` but only presence
  // is ever checked here.
  references?: unknown;
}

// Mirrors the `Association` base class in
// `sequelize/types/associations/base.d.ts`, narrowed to the fields read
// here; `otherKey` only exists on `BelongsToMany`
// (`sequelize/types/associations/belongs-to-many.d.ts`).
export interface SequelizeAssociation {
  associationType: "HasOne" | "BelongsTo" | "HasMany" | "BelongsToMany";
  foreignKey: string;
  otherKey?: string; // BelongsToMany only — the join column for the *other* model
  target: { name: string };
  as?: string;
  // BelongsToMany only — the junction. `.model.name` is the through model's
  // modelName, which matches its key in `sequelize.models` when the join
  // table is an explicit, registered model (vs. an implicit string table).
  through?: { model?: { name: string } };
}

// Mirrors one entry of `IndexesOptions[]` in `sequelize/types/model.d.ts`.
// A field is either a bare attribute name or an object whose `name` is the
// attribute name (the `{ name, order, length, ... }` normalized form).
export interface SequelizeIndex {
  unique?: boolean;
  fields?: (string | { name: string })[];
  name?: string;
}

// Mirrors `Model.uniqueKeys`, built internally by `Model.init()` from each
// attribute's `unique: true | string | { name }` option (lib/model.js) —
// unlike `options.indexes`, this is the only place the `unique: 'groupName'`
// shorthand's column grouping ends up, and it's keyed by physical column
// name (`definition.field`), not attribute name.
export interface SequelizeUniqueKey {
  fields: string[];
  name?: string;
}

// Mirrors the static `Model.rawAttributes`/`Model.associations` members in
// `sequelize/types/model.d.ts`. `primaryKeyAttributes`, `options.indexes`,
// and `uniqueKeys` carry the multi-column key/unique groupings a per-attribute
// flag can't.
export interface SequelizeModel {
  name: string;
  rawAttributes: Record<string, SequelizeAttribute>;
  associations: Record<string, SequelizeAssociation>;
  primaryKeyAttributes?: string[];
  options?: { indexes?: SequelizeIndex[]; comment?: string };
  uniqueKeys?: Record<string, SequelizeUniqueKey>;
  associate?: (models: Record<string, SequelizeModel>) => void;
}

// Mirrors the `Sequelize.models` member in `sequelize/types/sequelize.d.ts`.
export interface SequelizeInstance {
  models: Record<string, SequelizeModel>;
  define: (...args: unknown[]) => unknown;
}

export interface RelationSide {
  modelName: string;
  relatedModel: string;
  fieldName?: string;
  associationType: SequelizeAssociation["associationType"];
  foreignKey: string;
  throughModel?: string; // BelongsToMany only — the junction model's name
}
