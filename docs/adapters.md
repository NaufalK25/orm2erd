# How each adapter detects and parses models

This is a deep dive into how `orm2erd` finds and reads each ORM's schema — one section per ORM,
covering both the [detector](../src/detect/) (finds candidate entry points) and the
[adapter](../src/adapters/) (resolves an entry point and extracts an [`ERDModel`](../src/core/model.ts)
from it). See [CLAUDE.md](../CLAUDE.md) for the overall pipeline and the `Detector`/`ORMAdapter`
interfaces these all implement.

## Prisma

**Detect** — [`src/detect/prisma.ts`](../src/detect/prisma.ts)

- Resolves a `prisma.config.*` file's `schema` field via [`c12`](https://github.com/unjs/c12)'s
  `loadConfig({ name: "prisma" })` — same config Prisma's own CLI would use — and treats it as the
  primary candidate. This is entirely c12's own resolution logic, not something orm2erd hand-rolls:
  for each of c12's supported extensions (`.js .ts .mjs .cjs .mts .cts .json .jsonc .json5 .yaml
  .yml .toml`) it tries, in order, `prisma.config.{ext}` at the project root, then
  `.config/prisma.{ext}`, then `.config/prisma.config.{ext}` — so `prisma.config.ts`,
  `.config/prisma.js`, etc. are all picked up for free.
- Also checks the two zero-config default locations, `prisma/schema.prisma` and `schema.prisma`.
  If one of these exists alongside a config-resolved schema, both are surfaced as candidates
  rather than hiding the file on disk.

**Parse** — [`src/adapters/prisma/index.ts`](../src/adapters/prisma/index.ts)

Static parse, no code execution. `schema.prisma` is a DSL with an official parser, so this is the
only adapter that doesn't need to import the target project's code at runtime:

- `@prisma/internals`'s `getSchemaWithPath()` loads the schema file(s), then `getDMMF()` parses
  them into Prisma's own Data Model Meta Format.
- Datasource `url`/`directUrl`/`shadowDatabaseUrl` lines are stripped before parsing —
  `getDMMF()` only needs the schema's shape, but errors on missing datasource env vars otherwise.
- Fields: DMMF's `kind`/`type` map to a canonical type via a lookup table; `@default(...)`
  function calls (e.g. `now()`) are reconstructed as `name(args)` strings.
- Composite keys: single-column `@id`/`@unique` stay on the per-field `isPrimaryKey`/`isUnique`
  flags, but multi-column `@@id([...])`/`@@unique([...])` groupings (from `model.primaryKey.fields`
  and `model.uniqueFields`) can't be expressed per-field, so they're carried on the entity as
  `primaryKey`/`uniques` arrays. Composite-PK member fields still keep `isPrimaryKey` too, so
  emitters that only read per-field flags still mark them.
- Descriptions: `///` doc comments come through DMMF as `documentation` on both `Model` and
  `Field`, mapped straight to `Entity.description`/`Field.description` — no extra parsing needed.
- Plain indexes: `Datamodel.indexes` (top-level, not nested per-model) aggregates every index-like
  thing across all models — `@id`/`@unique`/`@@index`/`@@fulltext` — tagged with an `IndexType`.
  Only `type === "normal"` (i.e. `@@index`) is carried onto `Entity.indexes`; `"id"`/`"unique"` are
  already covered by `primaryKey`/`uniques` above. An index's name comes from `.name ?? .dbName`
  (both the `name:`/`map:` arguments land on `.dbName` in DMMF).
- Relations: Prisma emits a relation field on **both** related models sharing a `relationName`, so
  fields are grouped by that name and each pair collapses into one `Relation`. Cardinality comes
  from each side's `isList`; for 1-1, whichever side carries `relationFromFields` (the actual FK
  columns) becomes the `from`/owning side.
- Relation actions: `onDelete`/`onUpdate` come from the FK-holding side's `relationOnDelete`/
  `relationOnUpdate` (only set when `@relation(...)` declares them explicitly), mapped from
  Prisma's PascalCase action names (`Cascade`, `Restrict`, `NoAction`, `SetNull`, `SetDefault`) to
  the IR's lowercase spelling.

## Sequelize

**Detect** — [`src/detect/sequelize.ts`](../src/detect/sequelize.ts)

- Requires `sequelize` or `sequelize-typescript` in `dependencies`/`devDependencies`.
- Reads `.sequelizerc`'s `models-path` if present (a broken `.sequelizerc` doesn't fail detection —
  it just falls through to the next step).
- Otherwise falls back to conventional directory names: `models`, `src/models`, `db/models`,
  `app/models`.

**Parse** — [`src/adapters/sequelize/index.ts`](../src/adapters/sequelize/index.ts)

Runtime introspection, not static parsing — the entry file is actually imported so Sequelize's own
already-computed metadata (`.models`, `.associations`) can be read directly:

- The entry must be a single file (a directory entry only resolves to `index.js`/`index.ts` inside
  it; anything else is unsupported for now).
- Imported via `tsx`'s `tsImport()`, with `require`/`__filename`/`__dirname` polyfilled on
  `globalThis` first, since `tsImport` loads the file as ESM where those don't otherwise exist
  (needed for `sequelize-cli`-generated `index.js` files).
- Export shape varies a lot in the wild (named export, default export, CJS `db.sequelize`, a Model
  class's static `.sequelize`, ...), so the imported module is searched up to 3 levels deep for
  anything duck-typed as a Sequelize instance (has `.models` + `.define()`).
- Only Sequelize v6.x is supported — v7 stores `.models` as an iterable `Set` instead of a plain
  object, which would silently yield zero entities, so this is detected and rejected explicitly.
- Fields come from `model.rawAttributes`; type is looked up from the attribute type's `.key`,
  falling back to `constructor.name` when `.key` is absent. These usually agree (`STRING`, `ENUM`,
  ...), but `DataTypes.JSON`'s internal class name is `JSONTYPE` while its public key is `JSON` —
  reading `constructor.name` alone (the pre-fix behavior) rendered `JSONTYPE`. Primary keys don't
  get `allowNull` set even though they're implicitly `NOT NULL`, so that's special-cased.
- `DataTypes.ARRAY(inner)` wraps its element type on `.type` rather than exposing it directly —
  unwrapped once before the canonical-type lookup so the element's type (and, for
  `ARRAY(ENUM(...))`, its `enumValues`) carries through and `isList` gets set, instead of the whole
  column falling through to `unknown` with no list marker.
- Composite keys: a composite PK comes from `model.primaryKeyAttributes` (only carried on the
  entity when it spans >1 column); multi-column uniques come from `model.options.indexes` entries
  with `unique: true` and >1 field. Single-column PK/unique stay on the per-field flags.
- Descriptions: `Entity.description` comes from the model's `options.comment` (table comment);
  `Field.description` comes from each attribute's own `comment` option.
- Plain indexes: any `model.options.indexes` entry without `unique: true` is carried onto
  `Entity.indexes` (single- or multi-column), reusing the same field-name normalization as the
  composite-key extraction above. Unique entries stay excluded here — they're already covered by
  `primaryKey`/`uniques`.
- Relations come from `model.associations`. Sides are grouped by a key of the sorted model-name
  pair plus `foreignKey` (with `BelongsToMany`'s `foreignKey`/`otherKey` sorted too, since they
  swap between the two inverse sides). The association type on each group picks the relation type:
  `BelongsToMany` → `n-n`, `HasMany` → `1-n`, otherwise `1-1` — preferring the `BelongsTo` side as
  the FK-holding "owner" when both directions are declared.
- A `BelongsToMany` whose `through` junction is **itself an emitted entity** (an explicit,
  registered join model, matched by `through.model.name` against the emitted entity names) does
  **not** get a derived `n-n` edge: the two 1-n relations into that junction already convey the
  many-to-many, so the extra crossing edge would be redundant (standard ERD practice keeps the
  junction table, not the derived crossing). The `n-n` is only kept when the junction is an
  *implicit* string-named join table that isn't emitted as an entity — otherwise the link would be
  lost entirely.
- Relation actions: `onDelete`/`onUpdate` are read off the FK attribute itself
  (`rawAttributes[foreignKey].onDelete`/`.onUpdate`), not `association.options`. Sequelize's own
  `Association#_injectAttributes` (`belongs-to.js`/`has-many.js`/`belongs-to-many.js`) always
  resolves and writes these onto the FK attribute whenever `constraints !== false`, but only
  `BelongsTo` also mirrors them back onto `this.options` — `HasMany` doesn't, so reading `options`
  would silently miss most 1-n relations. Because Sequelize always defaults an unspecified
  `onDelete`/`onUpdate` (`SET NULL`/`CASCADE` depending on the FK's nullability) rather than
  leaving it unset, these get attached even when the model definition never declares them
  explicitly — this reflects the constraint Sequelize will actually create, not just what the user
  wrote.

## Mongoose

**Detect** — [`src/detect/mongoose.ts`](../src/detect/mongoose.ts)

Mongoose has no config file or folder convention to anchor on, so detection gets progressively
more expensive:

- Requires `mongoose` in `dependencies`/`devDependencies`.
- Falls back to conventional directory names (same list as Sequelize).
- If none of those exist, scans source files' contents for the pattern in
   [`src/adapters/mongoose/schema-source.ts`](../src/adapters/mongoose/schema-source.ts) — a file
   that both imports `"mongoose"` and calls `model(...)` / `new Schema(...)` — and suggests the
   parent directories of whatever matches. The scan
   ([`findFilesByContent`](../src/detect/shared.ts)) skips `node_modules`/`dist`/`build`/etc.,
   caps at 5000 files and 1MB per file, and this exact matcher is reused by the adapter below so
   the two never disagree about what counts as a schema file.

**Parse** — [`src/adapters/mongoose/index.ts`](../src/adapters/mongoose/index.ts)

Runtime introspection, same philosophy as Sequelize, with extra care around *which* `mongoose`
module instance gets imported and *which* files get executed:

- The entry can be a single file or a directory. For a directory, every file under it is
  content-checked with the same `looksLikeMongooseSchemaSource` matcher the detector uses before
  being imported for side effects — a directory can contain arbitrary app code (e.g. a file that
  calls `app.listen()`), so only files that actually look like schema definitions get imported.
- `mongoose` is resolved from the *target* file's own `node_modules` (via `createRequire`) and
  imported by that exact resolved path — importing a bare `"mongoose"` specifier from orm2erd's
  own resolution context would load a different module instance, whose global `.models` registry
  wouldn't see the side effects of the files imported next.
- `mongoose.set("overwriteModels", true)` is set before importing, and each file import is
  best-effort (a throw from one file doesn't abort the rest) — directory-wide import is inherently
  approximate.
- Fields come from each model's `schema.paths`. Mongoose's bookkeeping `__v` path and the
  synthetic `"someMap.$*"` value-type path (describes what a `Map` stores, not a field of its own)
  are filtered out. Array fields unwrap to their element type via `caster`/`embeddedSchemaType`.
  `_id` is always treated as the (non-nullable) primary key.
- Composite keys: there's no composite PK (`_id` is always the single key), but multi-column
  uniques are read from `schema.indexes()` — each compound index with `{ unique: true }` and >1
  field. Single-field `unique` stays on the path's own flag.
- No descriptions: Mongoose has no built-in comment/description option on a schema path or model,
  so `Entity.description`/`Field.description` are never populated by this adapter.
- Plain indexes: every other `schema.indexes()` entry (i.e. without `unique: true`) is carried onto
  `Entity.indexes`, single- or multi-column alike — this also picks up a path-level `{ index: true }`
  option, since Mongoose surfaces those through the same `schema.indexes()` call.
- Relations are the trickiest part: Mongoose has no shared relation key like Prisma's
  `relationName` or Sequelize's `foreignKey`. `ref`-bearing paths ("sides") are grouped by the
  sorted pair of the two model names, and only collapsed into one `Relation` when there's an exact
  reciprocal pair — each side declares exactly one `ref` and it points back at the other model.
  Anything else (a lone side, a self-reference, multiple distinct refs between the same two
  models) is emitted as standalone relations per side rather than guessed at, with cardinality
  inferred from `isList`/`isUnique` (see the comments on `buildPairedRelation`/
  `buildStandaloneRelation` for the exact rules).
- No relation actions: Mongoose has no FK-constraint/referential-action concept (no DB-level
  `ON DELETE`/`ON UPDATE`), so `Relation.onDelete`/`.onUpdate` are never populated by this adapter.

## TypeORM

**Detect** — [`src/detect/typeorm.ts`](../src/detect/typeorm.ts)

- Requires `typeorm` in `dependencies`/`devDependencies`.
- Checks for a legacy `ormconfig.{js,ts,json,yml,yaml,xml}` at the project root first (TypeORM
  ≤0.2.x auto-discovered one of these; removed in 0.3+ but still seen in older codebases) — the
  extension priority mirrors TypeORM's own `ConnectionOptionsReader` load order.
- Otherwise checks a handful of conventional `DataSource` file names (`src/data-source.ts`,
  `data-source.ts`, etc.) — a documentation convention, not something TypeORM itself enforces or
  auto-discovers.
- Otherwise falls back to scanning file contents (same `findFilesByContent` helper as Mongoose)
  for a file that imports `"typeorm"` and calls `new DataSource(...)`, via the matcher in
  [`src/adapters/typeorm/data-source-source.ts`](../src/adapters/typeorm/data-source-source.ts).

**Parse** — [`src/adapters/typeorm/index.ts`](../src/adapters/typeorm/index.ts)

The entry must be a single file. Extraction branches on what kind of file it is, but all three
paths converge on the same DB-connection-free metadata-building step:

- **Legacy `ormconfig.json`** (only the JSON variant is supported today — other formats raise an
  explicit "convert or migrate" error): parsed directly and used to build an "unconnected"
  `DataSource`/`Connection` instance from the installed `typeorm` package's own constructor,
  without ever calling `.connect()`/`.initialize()`.
- **A `.ts`/`.mts`/`.cts` entry**: compiled first with the *target project's own* installed
  `typescript` + its nearest `tsconfig.json` (real `tsc`, not orm2erd's lightweight esbuild-based
  transform). This is necessary because TypeORM's decorators (`@Column`, `@PrimaryGeneratedColumn`,
  ...) need `experimentalDecorators`'s legacy calling convention and often
  `emitDecoratorMetadata`-derived `design:type` reflection to infer column types — esbuild doesn't
  support `emitDecoratorMetadata` and doesn't emulate the legacy convention correctly, so importing
  a raw `.ts` entity file directly crashes inside TypeORM's own decorator code. The compiled output
  is written to a temp directory *inside* the target project (so upward `node_modules` resolution
  still finds the target's own `typeorm`/`reflect-metadata`) with its own `package.json` pinning
  `"type": "commonjs"`.
- **An already-compiled `.js` entry**: imported directly.

For the `.js`/compiled paths, the module is imported via `tsx`'s `tsImport()` (with the same
CJS-global polyfilling as Sequelize/Mongoose) and searched up to 3 levels deep for a duck-typed
`DataSource` instance (has `.options` + `.driver`) — same pattern as Sequelize's instance search.

Once a `DataSource`-like instance exists, regardless of path:

- Its `options.entities` array can mix already-resolved classes with glob-path strings (e.g.
  `"src/entity/**/*.ts"`) that TypeORM resolves itself via `require()`. Any glob strings are
  rewritten to point at the tsc-compiled mirror (compiling now, if the entry itself didn't already
  need a build) before being handed off.
- TypeORM's own internal `ConnectionMetadataBuilder` — not part of the public API, reached by
  resolving the installed package's real file path directly, bypassing its `"exports"` map — is
  used to call `buildEntityMetadatas()`. This is the exact same building block TypeORM itself uses
  inside `DataSource#initialize()` before ever opening a real connection, so no DB connection is
  needed here either.
- Synthetic `junction`/`closure`/`closure-junction` tables that TypeORM auto-generates (e.g. an
  implicit `@ManyToMany` join table) are filtered out — the `Relation` built from the owning side
  already implies them. `entity-child` (single-table-inheritance `@ChildEntity` subclasses) is
  kept, since each one is still a real entity the user wrote.
- Fields: `column.type` is either a driver-specific string (looked up in a table) or a plain JS
  constructor (`String`/`Number`/`Boolean`/`Date`) for columns with no explicit `type` option.
  Primary keys don't get `isNullable` set even though they're implicitly `NOT NULL`, same caveat
  as Sequelize. A Postgres array column (`@Column("text", { array: true })`) sets real TypeORM's
  `ColumnMetadata.isArray`, mapped straight to `Field.isList` — the base type (`text`) was already
  correct without this, so a missing `isList` silently understated the schema rather than looking
  obviously wrong.
- Composite keys: a composite PK comes from `entityMetadata.primaryColumns` (>1 column), and
  multi-column uniques from `entityMetadata.uniques` (each `@Unique([...])` spanning >1 column).
  Single-column PK/unique stay on the per-field flags.
- Descriptions: `Entity.description` comes from `@Entity({ comment })`, read off
  `entityMetadata.comment`; `Field.description` comes from `@Column({ comment })`, read off each
  column's own `comment`.
- Plain indexes: `entityMetadata.indices` (built from `@Index(...)`) filtered to `isUnique: false`
  is carried onto `Entity.indexes` — unique ones are already covered by
  `primaryKey`/`uniques`/per-field `isUnique`. Unlike the other adapters, TypeORM always generates
  an index `name` even when none is given explicitly, so `Index.name` is never empty here.
- Relations: TypeORM creates one `RelationMetadata` per declared side (e.g. `User.posts` and
  `Post.author` are two separate objects linked via `.inverseRelation`). Each relation type is
  emitted from exactly one side to avoid double-counting: `one-to-many` emits from the "one" side;
  `many-to-one` only emits standalone if no paired `@OneToMany` exists; `one-to-one` and
  `many-to-many` only emit from the owning side (the one carrying `@JoinColumn`/`@JoinTable`).
- Relation actions: `onDelete`/`onUpdate` come from `RelationMetadata.onDelete`/`.onUpdate` on
  whichever side actually owns the `@JoinColumn` — the paired `@ManyToOne` side for a
  `one-to-many`'s "one" side, or the relation itself for a standalone `many-to-one`/owning
  `one-to-one`, since that's the only place TypeORM accepts these options. TypeORM's own action
  spelling (`RESTRICT`, `CASCADE`, `SET NULL`, `DEFAULT`, `NO ACTION` — note `DEFAULT`, not
  `SET DEFAULT`) is mapped to the IR's lowercase form. Not read for `many-to-many`, since those
  relations carry no FK columns in the IR to attach an action to anyway.

## Drizzle

**Detect** — [`src/detect/drizzle.ts`](../src/detect/drizzle.ts)

- Requires `drizzle-orm` in `dependencies`/`devDependencies`.
- Checks for `drizzle.config.ts`, then `.js`, then `.json` at the project root — the same
  ts > js > json priority order `drizzle-kit`'s own CLI falls back through (verified against its
  compiled `drizzleConfigFromFile`). Unlike TypeORM's legacy `ormconfig`, this is a single default
  the tool itself resolves, not several sibling conventions worth flagging as ambiguous, so only
  the highest-priority file that actually exists is suggested.

**Parse** — [`src/adapters/drizzle/index.ts`](../src/adapters/drizzle/index.ts)

The entry is the `drizzle.config.*` file itself, not a schema file — the config's `dialect` field
determines which `drizzle-orm` dialect-core package (`pg-core`/`mysql-core`/`sqlite-core`/
`singlestore-core`) to introspect tables with, and its `schema` field points at the actual model
file(s):

- The config is loaded first. `defineConfig()` (from `drizzle-kit`) is just an identity function,
  so a `.ts`/`.js` config is imported directly via `tsx`'s `tsImport()` without ever needing the
  `drizzle-kit` package itself; `.json` is parsed directly. A syntactically-ESM config can still
  come back double-wrapped as `{ default: <config> }` when the nearest `package.json` doesn't
  declare `"type": "module"` (the same "double-wrapped default" shape the Sequelize adapter's own
  loader tolerates) — handled with a single conditional unwrap.
- `config.schema` (a glob or array of globs) is resolved with Node's built-in `fs.globSync`,
  relative to the config file's own directory — `drizzle-kit` itself resolves these against
  `process.cwd()`, which in practice is always the same directory the config file lives in. A
  glob match that's a directory expands to its immediate files (not recursive), mirroring
  `drizzle-kit`'s own `prepareFilenames`.
- Every matched file is imported via `tsImport()`, and every export checked with `is(value,
  PgTable)` (or the dialect's equivalent table class) — `is()` is `drizzle-orm`'s own
  entityKind-tag check, resistant to the dual-package-hazard `instanceof` would have across
  separately-installed copies. All of this — `is`, `getTableConfig`, the table/dialect classes —
  is resolved from the **target project's own installed** `drizzle-orm`, not orm2erd's (via
  `createRequire` from the config path), the same "use the target's own install" approach the
  TypeORM adapter takes for its internal metadata builder. Unlike TypeORM's private internals
  though, this is `drizzle-orm`'s own public API surface — the same surface `drizzle-kit` itself is
  built on.
- Fields come from `getTableConfig(table).columns`. Canonical type is decided primarily from
  `column.dataType` (a small, stable bucket: `string`/`number`/`boolean`/`date`/`json`/`bigint`/
  `buffer`/...); the generic `number` bucket is further split into `int`/`float`/`decimal` by
  keyword-matching `column.columnType` (e.g. `PgNumeric`, `MySqlFloat`), since `getSQLType()`'s
  actual SQL strings vary too much per dialect to enumerate reliably. `column.enumValues` is used
  directly when present (Drizzle exposes it uniformly across dialects, unlike TypeORM/Sequelize).
  Primary keys don't get `notNull` set even though they're implicitly `NOT NULL`, same caveat as
  the other runtime-introspection adapters.
- A `.array()` column (`dataType === "array"`, e.g. pg-core's `PgArray`) wraps its element column on
  `.baseColumn` — unwrapped once so canonical type, native type, and `enumValues` all key off the
  element instead of the array wrapper, and `Field.isList` is set from `dataType === "array"`.
  `PgArray.getSQLType()` already appends `"[size]"` itself, so `nativeType` is read from the
  unwrapped element's `getSQLType()` instead — emitters append their own `[]` via `isList` already,
  and using the wrapper's value directly would double it up.
- A column's actual DB name isn't always `column.name` — when a column has no explicit name
  (`keyAsName`) and the config sets a project-wide `casing: "camelCase" | "snake_case"` strategy,
  Drizzle transforms the JS property name at query time instead. This is replicated with the same
  `getColumnCasing` logic `drizzle-kit` itself uses (via `drizzle-orm/casing`'s `toCamelCase`/
  `toSnakeCase`), so FK/index column names line up with what the ORM actually sends to the
  database.
- Composite keys: a composite PK only ever comes from a table-level `primaryKey({ columns: [...]
  })` declaration (`getTableConfig(table).primaryKeys`) — a single-column `.primaryKey()` on a
  column builder instead just sets that column's own `.primary` and never appears there, so both
  are unioned into one per-field PK set. Multi-column uniques come from `uniqueConstraints` with
  >1 column; single-column ones (from either `.unique()` on the column or a single-column
  `unique().on(...)` table constraint) stay on the per-field flag.
- No descriptions: Drizzle has no comment/description option on a column or table builder, so
  `Entity.description`/`Field.description` are never populated by this adapter.
- Plain indexes: non-unique entries from `getTableConfig(table).indexes` are carried onto
  `Entity.indexes`. A functional index's column can be a raw SQL expression rather than an actual
  column — resolved to text via the dialect instance's `sqlToQuery`, same as raw defaults below.
- Relations come from ordinary foreign keys (`getTableConfig(table).foreignKeys`) — Drizzle has no
  separate declarative relation API backed by real constraints (its `relations()` helper is purely
  for the query-builder's relational API and isn't guaranteed to reflect an actual FK, so it's
  deliberately not read here). There's also no many-to-many API: a junction table's two ordinary
  FKs already produce two `1-n` relations into it, same end result as the other adapters'
  implicit-join-table case, with no extra collapsing needed.
- Cardinality: a FK column set that's fully covered by a unique constraint (or is itself a single
  unique/primary column) reads as a declared `1-1`; anything else is the "many" side of a `1-n` —
  the same uniqueness-based fallback the Sequelize adapter uses for an undeclared/ambiguous
  `BelongsTo`, since Drizzle has no separate `OneToOne`/`ManyToOne` declaration to trust instead.
- Relation actions: `onDelete`/`onUpdate` are read directly off the `ForeignKey` — Drizzle's
  `UpdateDeleteAction` union (`'cascade' | 'restrict' | 'no action' | 'set null' | 'set default'`)
  is identical across every dialect *and* identical to the IR's own `RelationAction`, so no mapping
  table is needed here, unlike the Sequelize/TypeORM adapters.
- Raw `sql` defaults (e.g. `.defaultNow()`) are resolved to displayable text via the dialect
  instance's `sqlToQuery` — a pure query-builder call needing no live DB connection. A default
  that fails to stringify (`drizzle-kit` itself only supports param-free `sql` default
  expressions) is left undefined rather than surfacing an internal error for a display-only value.

## MikroORM

Targets MikroORM v6 (`@mikro-orm/core@^6`) — classic `@Entity()`/`@Property()`/... decorators, the
dominant style in existing production/NestJS codebases. (v7 moved decorators to a different import
path and promotes a newer `defineEntity()` API instead; not targeted, though the discovery
mechanism below is unchanged between the two versions.)

**Detect** — [`src/detect/mikroorm.ts`](../src/detect/mikroorm.ts)

- Requires `@mikro-orm/core` in `dependencies`/`devDependencies`.
- Resolves the config file the same way MikroORM's own CLI does (`ConfigurationLoader.getConfigPaths()`,
  minus its `MIKRO_ORM_CLI_CONFIG` env-var tier, which has no filesystem convention to check):
  `package.json`'s `"mikro-orm": { "configPaths": [...] }` first, then a fixed priority list —
  `src/mikro-orm.config.ts`, `mikro-orm.config.ts`, `dist/mikro-orm.config.js`,
  `build/mikro-orm.config.js`, `src/mikro-orm.config.js`, `mikro-orm.config.js`. Like Drizzle's
  config resolution, this is a single well-known priority chain the tool itself falls back
  through, not several sibling conventions worth flagging as ambiguous — only the highest-priority
  file that actually exists is suggested.

**Parse** — [`src/adapters/mikroorm/index.ts`](../src/adapters/mikroorm/index.ts)

The entry is the config file. Unlike TypeORM, this never needs TypeORM's private
`ConnectionMetadataBuilder`-style reach-in — `MikroORM.init()`/`.getMetadata()` is MikroORM's own
public, documented API, and (unlike the `.d.ts` for some versions implies) `getMetadata().getAll()`
returns a plain `Dictionary<EntityMetadata>` in v6, not a `Map` — confirmed by reading the compiled
`MetadataStorage.js`, not assumed from the type declarations.

- The config file's default export is loaded via `tsImport()` and duck-typed as either a plain
  options object (the standard `defineConfig({...})` convention — has an `entities`/`entitiesTs`/
  `driver` field) or an already-initialized instance/promise (a bootstrap file that calls
  `MikroORM.init(...)` itself and exports the result) — tolerating one level of double-wrapped
  default export, same as the Drizzle adapter's config loader. For the instance/promise case,
  orm2erd can't force `connect: false`/`preferTs` (see below), so it depends on the target's own
  call already being safe to run without a reachable database.
- For the options-object case, `entities`/`entitiesTs` accept directory paths to scan (MikroORM's
  "folder-based discovery"), not just explicit classes — `entitiesTs` (TS source) is preferred over
  `entities` (compiled output) when present. MikroORM auto-detects whether it's running under
  ts-node/tsx via `Utils.detectTypeScriptSupport()` (checking `process.argv`/`execArgv` for
  `node_modules/tsx/`-style markers), which never matches orm2erd's own process (it calls
  `tsImport()` programmatically, not via a loader flag) — so `preferTs: true` is always forced in
  the options this adapter builds, or MikroORM would default to scanning nonexistent compiled
  `entities` output instead.
- **`connect: false` is a hard requirement, not just hygiene**: `MikroORM.init()` defaults
  `connect: true` in v6 and, *after* discovery succeeds, does `if (config.get('connect')) await
  orm.connect()` — if that throws (an unreachable DB, which it will be from orm2erd's process),
  the whole `init()` call rejects and metadata is never returned even though discovery already
  completed. Always forced off for the options-object path.
- Folder-based discovery calls `Utils.dynamicImport(path)` per matched file — a real dynamic
  `import()`, not `require()` — and `Utils` exposes an explicit override hook,
  `Utils.dynamicImportProvider` (a static property on the target's own imported `Utils` class,
  resolved via `createRequire` like the Drizzle adapter's own dependency loads). Set to a
  `tsImport`-backed function before the config file is even loaded, this routes every file
  MikroORM's own scanner touches through orm2erd's existing loader instead of a plain `import()`.
- Classic decorators still need real `tsc`, though for a narrower reason than TypeORM: MikroORM's
  default `ReflectMetadataProvider` only needs `emitDecoratorMetadata`-derived `design:type`
  reflection for a property with **no explicit `type`/`entity` option** — MikroORM itself throws a
  clear, catchable error for exactly that case ("provide either 'type' or 'entity' attribute"),
  rather than TypeORM's more opaque failure modes. Since sniffing which properties need it isn't
  worth the complexity, any `.ts` `entitiesTs` directory is unconditionally compiled with the
  target's own `typescript` + nearest `tsconfig.json` (forcing `--experimentalDecorators
  --emitDecoratorMetadata` via CLI flags — safe to force since v6 has no alternative decorator
  style to conflict with), reusing the same temp-dir-with-pinned-`package.json` approach as the
  TypeORM adapter's `runTargetTsc`. The compiled directory path is then substituted into `entities`
  in place of the original `entitiesTs` entry — MikroORM's own scanner does the rest.
- No standalone public "discover these paths for me" helper exists in v6 (that's a v7 addition,
  `@mikro-orm/core/file-discovery`) — directory-path strings (original or tsc-compiled-mirrored)
  are passed straight into the `entities` array of orm2erd's own `MikroORM.init()` call, and
  MikroORM's internal folder scan handles the rest, exactly as it would for a real project.
- Fields: canonical type is decided from `EntityProperty.type`, normalized by stripping a trailing
  `"Type"` suffix first — empirically, `type` isn't always the short registry key (`types.decimal`
  round-trips as `"DecimalType"`, not `"decimal"`) — falling back to the real driver SQL type
  (`columnTypes[0]`, trimmed of any `"(precision,scale)"` suffix) and then `runtimeType`
  (`'number'|'string'|'boolean'|...`) for anything still unrecognized.
- MikroORM never exposes an owning relation's physical FK column as its own scalar
  `EntityProperty` the way TypeORM does — there's no synthetic `"authorId"` property, `author`
  (with `fieldNames: ['author_id']`) *is* the relation. A `Field` is synthesized for it instead (for
  `m:1`/`1:1` owning props only — an owning `m:n` prop's `fieldNames` is just a bookkeeping echo of
  its own property name, not a real column on this table, since the join lives in the pivot table),
  typed off the referenced entity's own PK field(s) via `targetMeta`, paired positionally with
  `referencedColumnNames`.
- `@Embedded()`: MikroORM flattens embedded properties into `EntityMetadata.props` itself before
  this adapter ever sees them, and the two embedding modes leave opposite traces. Inline (the
  default) leaves the wrapper property with no column of its own (`columnTypes: []`) — only its
  already-flattened leaf properties (`kind: "scalar"`, real prefixed `fieldNames`, e.g.
  `address_street`) are physical, so the plain `kind === "scalar"` field filter already picks
  those up correctly with no special-casing. `{ object: true }` is the reverse: the wrapper
  property itself (`kind: "embedded"`, `object: true`) becomes the one physical column, storing the
  whole thing as JSON — resolved to canonical type `"json"` via the normal `columnTypes[0]`
  fallback tier, no override needed — and MikroORM additionally synthesizes a `persist: false`
  scalar mirror per embedded field (named `wrapper~field`) purely for JSON-path querying, which the
  field filter excludes via `persist !== false` (this also incidentally excludes any other
  `persist: false` computed/formula property, which was never a physical column either). A relation
  is never emitted for either mode — `"embedded"` is the only non-`"scalar"` kind that isn't handled
  by one of `buildRelation`'s relation-kind cases, falling through to its `default: undefined`.
- Composite keys: `compositePK`/`primaryKeys` (already property names, matching `Field.name`) carry
  a composite PK. Multi-column uniques come from `EntityMetadata.uniques` entries with >1
  `properties`; single-column ones from there, *or* directly from a scalar property's own `unique`
  flag (`@Property({ unique: true })`) — MikroORM keeps these two mechanisms separate, unlike
  TypeORM funneling both into one place.
- Descriptions: `Entity.description`/`Field.description` come from `@Entity({ comment })`/
  `@Property({ comment })`.
- Plain indexes: `EntityMetadata.indexes` entries (each `properties: string | string[]` resolved to
  an array) are carried onto `Entity.indexes` — uniques are already covered above.
- Relations: one `EntityProperty` exists per declared side (`User.posts` and `Post.author` are two
  separate properties paired via `mappedBy`/`inversedBy`) — each kind is emitted from exactly one
  side to avoid double-counting, the same `.inverseRelation`-style dedup as the TypeORM adapter:
  `1:m` emits from the "one" side (the FK column/`deleteRule`/`updateRule` belong to the paired
  `m:1` property found via `mappedBy`); `m:1` only emits standalone if unpaired (no `inversedBy`);
  `1:1`/`m:n` only emit from the owning side (`owner: true`).
- MikroORM's own synthesized implicit `m:n` pivot-table metadata (marked `pivotTable: true`) is
  filtered out before building entities — never a real user-declared entity, same idea as
  TypeORM's synthetic junction-table filtering, just a different marker.
- Relation actions: `deleteRule`/`updateRule` (**not** `cascade`, an unrelated ORM-level
  persist/merge/remove concept MikroORM deliberately decoupled from these in v7) map onto
  `Relation.onDelete`/`.onUpdate` — already close to the IR's own lowercase spelling, so this is
  mostly a pass-through table.
