// Local shapes for the @mikro-orm/core runtime metadata this adapter reads.
// Not imported from `@mikro-orm/core` itself for TYPES — every value at
// runtime is obtained via the TARGET project's own installed copy (see
// `createRequire` usage in index.ts), same "use the target's own install"
// principle as the Drizzle/TypeORM adapters. Trimmed to the v6 shape this
// adapter actually reads (verified against a real `@mikro-orm/core@6.6.16`
// install, not assumed from the package's own .d.ts, which in a couple of
// places doesn't match its own runtime — see the comments on
// `MikroOrmMetadataStorage.getAll` and `EntityProperty.type` below).

export type MikroOrmReferenceKind =
  "scalar" | "1:1" | "1:m" | "m:1" | "m:n" | "embedded";

export interface MikroOrmIndexOrUnique {
  properties?: string | string[];
  name?: string;
}

export interface MikroOrmEntityProperty {
  name: string;
  kind: MikroOrmReferenceKind;
  // Empirically NOT always the short registry key (`types` in
  // `@mikro-orm/core/types`) the `.d.ts` implies — e.g. `types.decimal`
  // round-trips as `"DecimalType"`, not `"decimal"`. Normalize with a
  // trailing "Type" strip before matching against a canonical-type table;
  // `columnTypes`/`runtimeType` are the reliable fallback tiers.
  type: string;
  runtimeType?: string;
  columnTypes?: string[];
  primary?: boolean;
  nullable?: boolean;
  unique?: boolean | string;
  array?: boolean;
  default?: string | number | boolean | null;
  enum?: boolean;
  items?: (number | string)[];
  comment?: string;
  fieldNames?: string[];
  // `kind: "embedded"` only, and only when declared `@Embedded(..., {
  // object: true })` — the wrapper property IS the physical column (stored
  // as one JSON value) rather than the usual case where an "embedded" kind
  // property is just a non-physical grouping node over already-flattened
  // scalar properties. See the comment on `buildEntity`'s `scalarFields`.
  object?: boolean;
  // False only for MikroORM's own synthesized per-field mirrors of an
  // `object: true` embedded property's contents (name suffixed `~field`) —
  // virtual, used for JSON-path querying, not a real column. Undefined
  // everywhere else, where it's equivalent to true.
  persist?: boolean;
  owner?: boolean;
  mappedBy?: string;
  inversedBy?: string;
  deleteRule?: string;
  updateRule?: string;
  pivotEntity?: string;
  referencedColumnNames?: string[];
  targetMeta?: MikroOrmEntityMetadata;
}

export interface MikroOrmEntityMetadata {
  className: string;
  collection: string;
  comment?: string;
  compositePK: boolean;
  primaryKeys: string[];
  props: MikroOrmEntityProperty[];
  indexes: MikroOrmIndexOrUnique[];
  uniques: MikroOrmIndexOrUnique[];
  // Set on MikroORM's own synthesized implicit m:n pivot-table metadata —
  // never a real user-declared entity, so filtered out the same way the
  // TypeORM adapter filters TypeORM's own synthetic junction tables.
  pivotTable?: boolean;
}

// `getAll()`'s real runtime return type differs by major version — a plain
// `Dictionary<EntityMetadata>` keyed by entity name in v6, but a real
// `Map<string, EntityMetadata>` in v7. Confirmed by reading the compiled
// `MetadataStorage.js` in both a real v6.6.16 and v7.1.9 install (not
// assumed from either version's `.d.ts`). The adapter branches on
// `instanceof Map` to normalize both into an array.
export interface MikroOrmMetadataStorage {
  getAll():
    | Record<string, MikroOrmEntityMetadata> // v6
    | Map<string, MikroOrmEntityMetadata>; // v7
}

export interface MikroOrmInstance {
  getMetadata(): MikroOrmMetadataStorage;
}

// Trimmed to the options fields this adapter reads/sets. `entities`/
// `entitiesTs` accept a mix of directory-path strings (folder-based
// discovery) and already-resolved classes/EntitySchema instances.
export interface MikroOrmOptions {
  entities?: unknown[];
  entitiesTs?: unknown[];
  baseDir?: string;
  driver?: unknown;
  [key: string]: unknown;
}

export interface MikroOrmCoreModule {
  MikroORM: {
    init(options: MikroOrmOptions): Promise<MikroOrmInstance>;
  };
  // The dynamic-import hook MikroORM's own folder-based entity discovery
  // calls per matched file — a static property on the target's own `Utils`
  // class (v7 moved this to `globalThis.dynamicImportProvider` instead; v6
  // keeps it here). Overriding it routes discovery through orm2erd's
  // existing tsx-based loader instead of a plain `import()`.
  Utils: { dynamicImportProvider: (id: string) => Promise<unknown> };
}
