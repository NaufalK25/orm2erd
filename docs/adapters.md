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
- Relations: Prisma emits a relation field on **both** related models sharing a `relationName`, so
  fields are grouped by that name and each pair collapses into one `Relation`. Cardinality comes
  from each side's `isList`; for 1-1, whichever side carries `relationFromFields` (the actual FK
  columns) becomes the `from`/owning side.

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
- Fields come from `model.rawAttributes`; type is looked up from the attribute type's
  `constructor.name` (e.g. `STRING`, `ENUM`). Primary keys don't get `allowNull` set even though
  they're implicitly `NOT NULL`, so that's special-cased.
- Composite keys: a composite PK comes from `model.primaryKeyAttributes` (only carried on the
  entity when it spans >1 column); multi-column uniques come from `model.options.indexes` entries
  with `unique: true` and >1 field. Single-column PK/unique stay on the per-field flags.
- Descriptions: `Entity.description` comes from the model's `options.comment` (table comment);
  `Field.description` comes from each attribute's own `comment` option.
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
- Relations are the trickiest part: Mongoose has no shared relation key like Prisma's
  `relationName` or Sequelize's `foreignKey`. `ref`-bearing paths ("sides") are grouped by the
  sorted pair of the two model names, and only collapsed into one `Relation` when there's an exact
  reciprocal pair — each side declares exactly one `ref` and it points back at the other model.
  Anything else (a lone side, a self-reference, multiple distinct refs between the same two
  models) is emitted as standalone relations per side rather than guessed at, with cardinality
  inferred from `isList`/`isUnique` (see the comments on `buildPairedRelation`/
  `buildStandaloneRelation` for the exact rules).

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
  as Sequelize.
- Composite keys: a composite PK comes from `entityMetadata.primaryColumns` (>1 column), and
  multi-column uniques from `entityMetadata.uniques` (each `@Unique([...])` spanning >1 column).
  Single-column PK/unique stay on the per-field flags.
- Descriptions: `Entity.description` comes from `@Entity({ comment })`, read off
  `entityMetadata.comment`; `Field.description` comes from `@Column({ comment })`, read off each
  column's own `comment`.
- Relations: TypeORM creates one `RelationMetadata` per declared side (e.g. `User.posts` and
  `Post.author` are two separate objects linked via `.inverseRelation`). Each relation type is
  emitted from exactly one side to avoid double-counting: `one-to-many` emits from the "one" side;
  `many-to-one` only emits standalone if no paired `@OneToMany` exists; `one-to-one` and
  `many-to-many` only emit from the owning side (the one carrying `@JoinColumn`/`@JoinTable`).
