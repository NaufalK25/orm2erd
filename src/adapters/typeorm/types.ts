// Local shapes for the TypeORM runtime metadata we read. Not imported from
// `typeorm` itself, to avoid a dual-package hazard if the target project has
// its own separate install — these mirror the relevant `.d.ts` shapes across
// 0.2.x/0.3.x/1.x closely enough to be treated as version-stable (see
// index.ts for how each is actually obtained at runtime).

// Mirrors `DataSource`/`Connection`'s public surface, trimmed to what
// `ConnectionMetadataBuilder` and this adapter read. `initialize` only
// exists on 0.3+'s DataSource (0.2.x's equivalent is `connect`), but nothing
// here calls either — its presence is only used as a duck-typing signal to
// recognize "this looks like a DataSource instance" among a module's exports.
export interface TypeOrmDataSourceInstance {
  options: { entities?: unknown[] };
  driver: unknown;
  initialize?: () => Promise<unknown>;
}

// Mirrors `connection/ConnectionMetadataBuilder.ts`'s public surface — a
// class deep-imported from the target project's own installed `typeorm`
// (see loadConnectionMetadataBuilderClass in index.ts), not part of the
// package's public API surface but stable across 0.2.x–1.x.
export interface TypeOrmConnectionMetadataBuilderCtor {
  new (connection: TypeOrmDataSourceInstance): {
    buildEntityMetadatas(entities: unknown[]): Promise<TypeOrmEntityMetadata[]>;
  };
}

// Mirrors `metadata/ColumnMetadata.ts`.
export interface TypeOrmColumnMetadata {
  propertyName: string;
  type: string | Function;
  isPrimary: boolean;
  isNullable: boolean;
  default?: unknown;
  enum?: (string | number)[];
}

// Mirrors `metadata/UniqueMetadata.ts`.
export interface TypeOrmUniqueMetadata {
  columns: TypeOrmColumnMetadata[];
}

// Mirrors `metadata/RelationMetadata.ts`.
export interface TypeOrmRelationMetadata {
  relationType: "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many";
  propertyName: string;
  isOwning: boolean;
  joinColumns: TypeOrmColumnMetadata[];
  inverseEntityMetadata: TypeOrmEntityMetadata;
  inverseRelation?: TypeOrmRelationMetadata;
}

// Mirrors `metadata/EntityMetadata.ts`. `tableType` distinguishes real
// user-declared entities ("regular"/"view") from tables TypeORM synthesizes
// itself — "junction" for an implicit @ManyToMany join table, "closure" /
// "closure-junction" for @Tree("closure-table") — which shouldn't surface
// as their own Entity since the Relation they back already implies them.
export interface TypeOrmEntityMetadata {
  name: string;
  tableType:
    | "regular"
    | "view"
    | "junction"
    | "closure"
    | "closure-junction"
    | "entity-child";
  columns: TypeOrmColumnMetadata[];
  relations: TypeOrmRelationMetadata[];
  uniques: TypeOrmUniqueMetadata[];
  primaryColumns: TypeOrmColumnMetadata[];
}
