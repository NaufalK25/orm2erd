// Local shapes for the Mongoose runtime metadata we read. Not imported from
// `mongoose` itself, to avoid a dual-package hazard if the target project
// has its own separate install — same reasoning as the Sequelize adapter.
// Trimmed from mongoose's own `mongoose/types/*.d.ts`; check those on a real
// mismatch. `caster` is the one exception below: it's real, present in
// every version probed (6.x-8.x), but undocumented — it doesn't appear in
// the .d.ts files at all, only `embeddedSchemaType` does.

// Mirrors `SchemaTypeOptions` in `mongoose/types/schematypes.d.ts` (class,
// ~line 58), narrowed to the fields read here.
export interface MongooseSchemaTypeOptions {
  ref?: string;
  unique?: boolean;
  default?: unknown;
  enum?: string[] | { values?: string[] };
}

// Mirrors `SchemaType` in `mongoose/types/schematypes.d.ts` (class, ~line
// 290) for `instance`/`isRequired`/`options`. `embeddedSchemaType` mirrors
// the same file's `SchemaArray`/`DocumentArray` subclasses (~lines 417,
// 520) — the array element type, renamed from `caster` in mongoose 9.x.
export interface MongooseSchemaType {
  instance: string;
  isRequired?: boolean;
  options?: MongooseSchemaTypeOptions;
  caster?: MongooseSchemaType;
  embeddedSchemaType?: MongooseSchemaType;
}

// Mirrors the `Model` class's `modelName`/`schema` members in
// `mongoose/types/models.d.ts` (~lines 625, 1218).
export interface MongooseModel {
  modelName: string;
  schema: { paths: Record<string, MongooseSchemaType> };
}

// Mirrors the `models`/`set` exports of `mongoose/types/index.d.ts` (~lines
// 51-56 for `Models`/`models`, ~line 138 for `set`).
export interface MongooseModule {
  models: Record<string, MongooseModel>;
  set: (key: string, value: unknown) => void;
}

export interface RefSide {
  modelName: string;
  relatedModel: string;
  fieldName: string;
  isList: boolean;
  isUnique: boolean;
}
