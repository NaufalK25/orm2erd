# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 🏷️ [1.9.0] - 2026-07-30

### 🚀 Added

- **Optional-relation support.** The IR's `Relation` gained `isFromOptional`, marking whether the
  `from` (referenced/parent) end is optional — i.e. the FK column on the `to` (child) side is
  nullable, so a child row can exist without a parent. All five adapters now resolve it: Prisma
  from `field.isRequired`, Sequelize/Drizzle from the FK column's own nullability (both quirkily
  never set `allowNull`/`notNull` on primary keys, so that's special-cased to always non-nullable),
  TypeORM from the owning join column's `isNullable`, and Mongoose from `path.isRequired` on
  whichever side holds the ref. Getting adapters to report this consistently also meant fixing the
  relation `from`/`to` assignment itself in a few spots (Prisma 1-1, TypeORM one-to-one, Mongoose
  paired/standalone refs) so the FK-holding side always lands on `to`, matching the invariant every
  other relation shape already followed. Mermaid renders it directly: the `to` end is always `o`
  (nothing can force a parent to have a child), while the `from` end downgrades from `||` to `|o`
  when `isFromOptional` is set.
  ([ac86c73](https://github.com/NaufalK25/orm2erd/commit/ac86c73))
- **Physical table/column names in the IR.** `Entity.tableName` and `Field.columnName` are now
  populated whenever the physical name differs from the logical one — Prisma's `@@map`/`@map`,
  Sequelize's `tableName`/`field` options, TypeORM's `entityMetadata.tableName`/
  `column.databaseName`, and Mongoose's `model.collection.name`. Drizzle is exempt: its `name`/
  `getColumnName()` already resolve the physical SQL name directly (it has no separate ORM-level
  model name to diverge from), so `tableName`/`columnName` would always just equal `name` there.
  Not yet rendered by any emitter — this lays the groundwork for surfacing physical names in
  generated diagrams.
  ([5015f1c](https://github.com/NaufalK25/orm2erd/commit/5015f1c))

### 💊 Fixed

- Two relations sharing the same alias but different FK columns (e.g. two FKs from the same entity
  pair) rendered identical, ambiguous edge labels. A new `relationLabel()` helper (`emitters/
  label.ts`) appends the FK column in parentheses when it differs from the field name — e.g.
  `author (authorId)` — used by Mermaid, D2, and PlantUML.
  ([6f21524](https://github.com/NaufalK25/orm2erd/commit/6f21524))

## 🏷️ [1.8.0] - 2026-07-29

### 🚀 Added

- **Per-phase progress during generation.** The CLI's spinner now updates its label through
  `Resolving entry…` → `Parsing schema…` → `Generating diagram(s)…` → `Writing output…` instead of
  sitting on a single generic `Generating...` for the whole run — useful feedback on larger schemas
  where parsing alone can take a few seconds. Non-interactive mode prints each phase as its own log
  line instead. Output-suppression during `extract()` is bypassed for the spinner's own writes
  specifically, and each phase yields briefly before starting so its label has a chance to paint
  before a long synchronous phase (e.g. importing the target's models) starves the spinner's redraw
  interval.
  ([1cceee2](https://github.com/NaufalK25/orm2erd/commit/1cceee2))

### 💊 Fixed

- Sequelize: an FK column declared only via `HasMany`/`HasOne`/`BelongsToMany` (i.e. every
  association type other than `BelongsTo`) was missed by `isForeignKey`, since 1.7.0's fix matched
  FK-ness against `BelongsTo` associations specifically. Reading the attribute's own resolved
  `references` (set by `addForeignKeyConstraints` regardless of which side declared the
  association) is accurate for all of them instead of reconstructing FK-ness from association
  direction.
  ([a399138](https://github.com/NaufalK25/orm2erd/commit/a399138))
- Sequelize/Drizzle/TypeORM: array columns lost their element type. Sequelize's `DataTypes.ARRAY`
  wraps its element type rather than exposing it directly, so an array column fell through to
  `unknown` with no list marker; Drizzle's `.array()` columns (e.g. pg-core's `PgArray`) wrap
  theirs on `.baseColumn` the same way; TypeORM's `@Column("text", { array: true })` sets
  `ColumnMetadata.isArray`, which wasn't read at all. All three now unwrap to the element for
  canonical type, native type, and `enumValues`, and set `Field.isList` so emitters render the
  `[]` suffix. Also fixed, in the same pass: Sequelize's `DataTypes.JSON` rendered as `JSONTYPE`
  (its internal class name) instead of `JSON` (its public type key, now preferred when present),
  and canonical-type coverage was extended to several previously-unmapped Sequelize types
  (`UUID`, `MEDIUMINT`, `DOUBLE PRECISION`, `TIME`, `VIRTUAL`, `RANGE`, `GEOMETRY`, `GEOGRAPHY`,
  `HSTORE`, `INET`, `CIDR`, `MACADDR`).
  ([dc3c817](https://github.com/NaufalK25/orm2erd/commit/dc3c817))
- Sequelize: a composite unique declared via the `unique: 'groupName'` shorthand on individual
  attributes was silently dropped, since that grouping only ever surfaces on `model.uniqueKeys` —
  never on `model.options.indexes`, which the adapter read exclusively. Both sources are now read
  and merged (deduped by sorted field list, in case the same group is redundantly declared through
  both). Mermaid, D2, GraphViz DOT, and PlantUML now also mark a field `UK` and annotate its
  composite-unique group members ("unique with: ...") when it's unique only by virtue of
  multi-column membership, not its own `isUnique` flag.
  ([2a73940](https://github.com/NaufalK25/orm2erd/commit/2a73940))

## 🏷️ [1.7.0] - 2026-07-27

### 🚀 Added

- **Drizzle support.** Detection requires `drizzle-orm` in dependencies and checks for
  `drizzle.config.ts`, then `.js`, then `.json` at the project root — the same priority order
  `drizzle-kit`'s own CLI falls back through. Extraction takes the config file itself as the entry
  point: its `dialect` field selects which `drizzle-orm` dialect-core package
  (`pg-core`/`mysql-core`/`sqlite-core`/`singlestore-core`) to introspect tables with, and its
  `schema` glob(s) point at the actual table files, all imported via `tsx`'s `tsImport()` and read
  through `drizzle-orm`'s own `is()`/`getTableConfig()` — the target project's own installed
  `drizzle-orm`, not orm2erd's. Supports composite primary keys, multi-column unique constraints
  and indexes (including functional/expression indexes resolved via the dialect's `sqlToQuery`),
  the project's `casing: "camelCase" | "snake_case"` strategy for columns with no explicit name,
  `onDelete`/`onUpdate` relation actions, and raw `sql` defaults. Cardinality falls back to
  FK-column uniqueness the same way the Sequelize adapter's undeclared `BelongsTo` does, since
  Drizzle has no separate `OneToOne`/`ManyToOne` declaration to trust instead. Drizzle has no
  comment/description option on a column or table, so `description` is never populated. See the
  new "Drizzle" section in `docs/adapters.md`.
  ([b926c03](https://github.com/NaufalK25/orm2erd/commit/b926c03))
- **Programmatic API.** `orm2erd` now exports `detectORMs`, `getAdapter`, `getEmitter`, and the
  `ERDModel`/`Entity`/`Field`/`Relation`/`Index` IR types from its package root (`src/index.ts`),
  mirroring the CLI's own detect → extract → emit pipeline for use as a library, not just a CLI.
  ([871a9e7](https://github.com/NaufalK25/orm2erd/commit/871a9e7))
- **Grid layout for the interactive format picker.** The `Output format(s)` prompt now lays
  options out in an auto-sized grid — column count computed from terminal width and label length,
  capped at 3 — instead of one per line, with arrow keys navigating by row/column. Ragged last rows
  (e.g. 7 options in 3 columns) are handled explicitly so up/down/left/right always land on a real
  cell instead of wrapping into the wrong one.
  ([0d8be5a](https://github.com/NaufalK25/orm2erd/commit/0d8be5a))

### 💊 Fixed

- Sequelize: a plain column that happened to share its name with another model's foreign key was
  incorrectly marked as an FK itself, because the FK-column set was built from every association's
  `foreignKey` regardless of association type. Only `BelongsTo` associations contribute now, since
  `HasMany`/`HasOne` name a column on the *target* model, not the one declaring the association.
  ([fba2390](https://github.com/NaufalK25/orm2erd/commit/fba2390))
- Sequelize: a 1-1 relation backed only by a lone `BelongsTo` (no reciprocal `HasOne` registered)
  always rendered `1-1` even when the FK column wasn't actually unique — indistinguishable from an
  undeclared `HasMany`'s "many" side. It's now trusted as `1-1` only when an explicit `HasOne`
  pairing exists or the FK column is itself unique; otherwise it renders `1-n`, and the parent/child
  direction is normalized consistently with the `HasMany` case above.
  ([fba2390](https://github.com/NaufalK25/orm2erd/commit/fba2390))

## 🏷️ [1.6.0] - 2026-07-24

### 🚀 Added

- **`--check` flag**: regenerates the ERD in memory and compares it against what's already on
  disk instead of writing — up to date exits `0`; drifted prints a diff and exits `1`; missing
  exits `1` too. Never touches the filesystem, so it's safe in a pre-commit hook or CI. The diff
  highlights only the changed words within an edited line (via an LCS-based word diff), not the
  whole line, alongside plain `+`/`-` for added/removed lines. Forces non-interactive mode so it
  never blocks on a prompt. See the new "Keeping the ERD in sync (CI)" README section for a
  drop-in GitHub Actions workflow.
  ([bb2249e](https://github.com/NaufalK25/orm2erd/commit/bb2249e), [b43c3c5](https://github.com/NaufalK25/orm2erd/commit/b43c3c5))
- **Composite primary keys and multi-column unique constraints.** `Entity.primaryKey`/`.uniques`
  carry the ordered member columns of a composite key/multi-column unique across all four adapters
  (Prisma's `@@id`/`@@unique`, Sequelize's `primaryKeyAttributes`/`options.indexes`, Mongoose's
  compound `schema.indexes()`, TypeORM's `primaryColumns`/`uniques`); single-column keys still use
  the existing per-field `isPrimaryKey`/`isUnique`. DBML renders these as a native
  `indexes { (a, b) [pk] }`/`[unique]` block; other emitters mark the member fields individually.
  ([8c8287c](https://github.com/NaufalK25/orm2erd/commit/8c8287c))
- **Plain (non-unique) indexes.** `Entity.indexes` carries single- or multi-column lookup indexes
  (Prisma `@@index`, Sequelize `options.indexes`, Mongoose `schema.indexes()`, TypeORM `@Index()`),
  rendered as DBML `indexes { ... }` entries; other emitters have no equivalent construct and
  skip them.
  ([02cc05a](https://github.com/NaufalK25/orm2erd/commit/02cc05a))
- **Descriptions and comments.** Doc comments (Prisma's `///`, Sequelize's `comment` option,
  TypeORM's `@Entity({ comment })`/`@Column({ comment })`) are read onto `Entity.description`/
  `Field.description` and rendered as a DBML `Note`/inline `note:`, a Mermaid comment line/trailing
  annotation, or a PlantUML note. Mongoose has no comment concept on a schema, so its adapter never
  populates these.
  ([1db3ca1](https://github.com/NaufalK25/orm2erd/commit/1db3ca1))
- **`onDelete`/`onUpdate` relation actions.** Referential actions declared on a foreign key
  (Prisma's `@relation(onDelete: ...)`, Sequelize's FK attribute options — including the defaults
  Sequelize itself applies when nothing is declared, and TypeORM's `@ManyToOne`/`@OneToOne`
  options) are carried on `Relation.onDelete`/`.onUpdate` and rendered as DBML's
  `[delete: cascade, update: restrict]`. Mongoose has no FK-constraint concept, so its adapter
  never populates these.
  ([f466993](https://github.com/NaufalK25/orm2erd/commit/f466993))
- **GraphViz DOT output** (`--format graphvizdot`), emitting an HTML-label table per entity with
  `PK`/`FK`/`UK` markers and directed edges with crow's-foot-style arrowheads for `1-1`/`1-n`/`n-n`
  cardinality.
  ([bcbe496](https://github.com/NaufalK25/orm2erd/commit/bcbe496))
- Friendlier errors for common Sequelize/Mongoose/TypeORM extraction failures: a missing
  target-project dependency, a missing `reflect-metadata` import, an eager database connection
  attempt at import time, or a CommonJS/ESM mismatch now get an actionable hint appended below the
  raw error, instead of surfacing only the bare error message.
  ([c68bbbd](https://github.com/NaufalK25/orm2erd/commit/c68bbbd))

### 💊 Fixed

- A Sequelize `BelongsToMany` whose `through` junction is itself an emitted entity produced a
  redundant derived `n-n` relation on top of the two `1-n` edges already implied by the junction's
  own associations. The derived edge is now suppressed whenever the junction is actually rendered
  as its own table (an implicit, unnamed join table that isn't emitted as an entity still keeps its
  `n-n` edge, since nothing else conveys the relationship for it).
  ([c90e697](https://github.com/NaufalK25/orm2erd/commit/c90e697))
- DBML `Note`/index-name values were wrapped in single quotes with embedded single quotes escaped
  to double quotes, which read oddly for descriptions that were themselves already double-quoted
  prose. Both are now consistently double-quoted, with embedded double quotes escaped to single
  quotes instead.
  ([cff5807](https://github.com/NaufalK25/orm2erd/commit/cff5807))

## 🏷️ [1.5.0] - 2026-07-21

### 🚀 Added

- **TypeORM support.** Detection recognizes legacy 0.2.x `ormconfig.*` (JSON)
  alongside the 0.3+ convention of a `data-source.ts`/`.js` file exporting a
  `DataSource`, falling back to a content scan when neither exists — the same
  tiered approach as Sequelize/Mongoose detection. Extraction builds metadata
  via TypeORM's own internal `ConnectionMetadataBuilder` (the same class
  TypeORM itself uses inside `DataSource#initialize()`, before ever opening a
  real connection), so it stays DB-connection-free. `.ts` entity/DataSource
  files are compiled with the target project's own installed `typescript` +
  `tsconfig.json` first, since TypeORM's decorators rely on
  `emitDecoratorMetadata`/the legacy `experimentalDecorators` calling
  convention, neither of which `tsx`'s esbuild-based transform can emit
  correctly. Supports decorator entities, `EntitySchema` (plain-object)
  entities, and legacy 0.2.x connections built without ever calling
  `.connect()`.
  ([6db88ff](https://github.com/NaufalK25/orm2erd/commit/6db88ff))
- **QuickDBD output** (`--format quickdbd`), emitting dbdiagram.io's QuickDBD
  syntax with inline `PK`/`FK`/`UNIQUE`/`NULL` field constraints — QuickDBD
  has no separate relationship section, so the FK marker sits directly on
  whichever field physically holds the key — plus enum/default values as
  trailing `#` comments.
  ([69528f2](https://github.com/NaufalK25/orm2erd/commit/69528f2))
- Colorized CLI output (help text, prompts, success/error messages) via
  `picocolors`, plus an icon on each interactive step (detection, entry
  point, format, output path, type mode, generating, result). Both color and
  icons auto-disable in environments without color/Unicode support (CI,
  `NO_COLOR`, non-UTF8 terminals), using the same detection heuristic
  `@clack/prompts` already relies on for its own prompt symbols — falling
  back to plain ASCII (`o`/`x`) for status icons and to nothing for purely
  decorative ones.
  ([5e19229](https://github.com/NaufalK25/orm2erd/commit/5e19229))

### 💊 Fixed

- The Mermaid emitter's `%% Entities`/`%% Relationships` section comments
  weren't indented to match the rest of the diagram body.
  ([bd2d1eb](https://github.com/NaufalK25/orm2erd/commit/bd2d1eb))

## 🏷️ [1.4.0] - 2026-07-20

### 🚀 Added

- **D2 output** (`--format d2`), emitting `sql_table`-shaped nodes with
  `pk`/`fk`/`unique` field constraints, `NOT NULL`/`DEFAULT ...` inline
  comments, and crow's-foot cardinality via `cf-one`/`cf-many` arrowhead
  shapes on `<->` connections (D2 has no inline symbol for it like
  Mermaid/DBML). Identifiers are always quoted to sidestep D2's reserved
  top-level keywords (`shape`, `style`, `layers`, …).
  ([81d9fc0](https://github.com/NaufalK25/orm2erd/commit/81d9fc0))
- **nomnoml output** (`--format nomnoml`), emitting `<table>`-classifier
  nodes with `PK`/`FK`/`unique`/`NN` field tags and `1 -- 1`/`1 -- *`/`* -- *`
  multiplicity relations.
  ([ec375fd](https://github.com/NaufalK25/orm2erd/commit/ec375fd))
- Every emitter now separates entities and relationships with an
  `// Entities` / `// Relationships` heading (or the format's own comment
  syntax) and a blank line between entity blocks, instead of one unbroken
  stream of lines.
  ([c9c645c](https://github.com/NaufalK25/orm2erd/commit/c9c645c))

### 💊 Fixed

- Target codebases whose entry file logs straight to `process.stdout`/
  `process.stderr` (e.g. pino, morgan, winston's default console transport)
  instead of going through `console.*` leaked that output past
  `--verbose`'s suppression, since only `console.*` was being patched. Both
  streams are now patched too.
  ([f523e5c](https://github.com/NaufalK25/orm2erd/commit/f523e5c))
- The CLI could hang after a successful run instead of exiting — importing
  the target codebase to introspect it (a DB connection, timers, etc.) can
  leave open handles that hold Node's event loop open forever. The process
  now exits explicitly once output is written.
  ([9829cb6](https://github.com/NaufalK25/orm2erd/commit/9829cb6))
- `Sequelize.literal(...)` default values (e.g. `nextval('posts_id_seq')`
  for a Postgres sequence default) were resolved to the wrapper's
  constructor name instead of the actual SQL expression — the fallback for
  sentinel `DataTypes` instances (`UUIDV4`, `NOW`, …) matched it too, since
  both are property-less class instances. `Literal`'s wrapped `val` is now
  read directly instead.
  ([6f20968](https://github.com/NaufalK25/orm2erd/commit/6f20968))
- A default value containing a double quote (e.g. a JSON default like
  `{"a":""}`) broke the emitted DBML/Mermaid output by prematurely closing
  the surrounding quoted attribute. Embedded double quotes are now escaped
  to single quotes before emitting, consistent with how string defaults are
  already handled elsewhere.
  ([bb452ee](https://github.com/NaufalK25/orm2erd/commit/bb452ee))

## 🏷️ [1.3.0] - 2026-07-17

### 🚀 Added

- **Mongoose support.** Detection scans model files for `Schema`/`model`
  calls (no config-file convention to anchor on like Prisma's
  `schema.prisma` or Sequelize's model dir), and extraction runs the user's
  compiled/ts-node'd model files at runtime to read `mongoose.models` and
  each schema's `paths`. Relations are inferred from `ref` options, with
  cardinality read off array-vs-singular paths and `unique`.
  ([f60a680](https://github.com/NaufalK25/orm2erd/commit/f60a680))
- **PlantUML output** (`--format plantuml`), emitting entity-relationship
  syntax with crow's-foot notation (`hide circle`,
  `skinparam linetype ortho`), matching the existing Mermaid/DBML emitters.
  ([22a25f2](https://github.com/NaufalK25/orm2erd/commit/22a25f2))

### 💊 Fixed

- The Mermaid emitter wrote files with a `.mermaid` extension, which few
  editors or GitHub recognize for syntax highlighting. It now uses `.mmd`,
  the extension actually recognized by the Mermaid CLI, Live Editor, and
  GitHub/GitLab's native rendering.
  ([615b019](https://github.com/NaufalK25/orm2erd/commit/615b019))
- DBML enum values were emitted unquoted (e.g. `admin`), which broke for
  values containing spaces, dashes, or other symbols (e.g. `in-progress`,
  `pending review`) since DBML parses an unquoted value as a bare
  identifier. Values are now wrapped in double quotes (`"in-progress"`),
  matching DBML's actual enum syntax.
  ([ec1e7eb](https://github.com/NaufalK25/orm2erd/commit/ec1e7eb), [decd96f](https://github.com/NaufalK25/orm2erd/commit/decd96f))
- The DBML table emitter's closing `}` was indented two spaces, inconsistent
  with every other emitted line.
  ([95cfe45](https://github.com/NaufalK25/orm2erd/commit/95cfe45))
- Sequelize default values that are sentinel `DataTypes` instances (e.g.
  `DataTypes.UUIDV4`, `DataTypes.NOW`) have no own properties, so
  `JSON.stringify` on them just produced `"{}"`. These now fall back to the
  constructor name (e.g. `UUIDV4()`), matching how column types are already
  resolved, with `()` appended to signal it's generated rather than a
  literal.
  ([ca33066](https://github.com/NaufalK25/orm2erd/commit/ca33066))

## 🏷️ [1.2.3] - 2026-07-17

### 🚀 Added

- Sequelize extraction now also auto-loads a `.env.local` file (in addition
  to `.env`) from the project root before running, matching the common
  Next.js-style local-env convention. This is best-effort: it just makes
  those variables available to the entry file while it loads, in case the
  target codebase validates env vars (e.g. for DB config) at import time.
  ([bf25dac](https://github.com/NaufalK25/orm2erd/commit/bf25dac))

### 💊 Fixed

- A target entry file calling `process.exit()` while orm2erd was loading it
  (e.g. on a failed DB connection attempt) killed the whole CLI before our
  own error handling ever saw it, showing a misleading "Canceled" instead of
  a real error. It's now caught and surfaced as a normal, readable error.
  ([f5bad5d](https://github.com/NaufalK25/orm2erd/commit/f5bad5d))
- The release workflow's "is this commit newly tagged" check compared an
  annotated tag's own object SHA (what `git rev-parse refs/tags/vX.Y.Z`
  returns) against the commit SHA, which never match — so it always
  concluded the tag wasn't new and silently skipped the release. The tag is
  now peeled to the commit it points at before comparing.
  ([3e2e07e](https://github.com/NaufalK25/orm2erd/commit/3e2e07e))

## 🏷️ [1.2.2] - 2026-07-17

### 💊 Fixed

- Sequelize model loading failed with `__dirname is not defined in ES module
  scope` on entry files (e.g. sequelize-cli's generated `models/index.js`,
  or a TS port of it) that reference `__filename`/`__dirname`/`require` at
  module scope. Those CJS globals are now polyfilled before the file loads,
  matching the `require` polyfill already in place.
  ([31ea09c](https://github.com/NaufalK25/orm2erd/commit/31ea09c))

## 🏷️ [1.2.1] - 2026-07-16

### 💊 Fixed

- Release tags were being created as `v.X.Y.Z` (with a stray dot) instead of
  the standard `vX.Y.Z`. The auto-tag and release workflows now produce
  correctly formatted tags, and existing `v.*` tags have been replaced with
  `v*` equivalents.
  ([fb9e8c5](https://github.com/NaufalK25/orm2erd/commit/fb9e8c5))
- Release workflow now publishes to npm via trusted-publisher OIDC instead of
  a long-lived `NPM_TOKEN` secret.
  ([feb7355](https://github.com/NaufalK25/orm2erd/commit/feb7355))
- The release workflow could fail to run after Auto Tag completed on a push
  that didn't actually create a new tag, or miss a run entirely; it's now
  chained more reliably off Auto Tag's completion, with `workflow_dispatch`
  as a manual fallback that skips the tag/commit match check.
  ([d0728ba](https://github.com/NaufalK25/orm2erd/commit/d0728ba), [e83cfe8](https://github.com/NaufalK25/orm2erd/commit/e83cfe8))

## 🏷️ [1.2.0] - 2026-07-16

### 🚀 Added

- DBML emitter (`--format dbml`): tables with field constraints (`pk`,
  `unique`, `not null`, `default: ...`), `Ref:` relation lines derived from
  each relation's actual FK column on both sides, and `Enum` blocks for
  enum-typed fields.
  ([055e32c](https://github.com/NaufalK25/orm2erd/commit/055e32c))
- GitHub Actions CI (tests + lint on push/PR) and an automated release-tag
  workflow that tags a version whenever it changes on `package.json`.
  ([445dd80](https://github.com/NaufalK25/orm2erd/commit/445dd80))

### 💊 Fixed

- `--out` with multiple formats stripped *any* extension already on the base
  path and replaced it per emitter, even when that extension wasn't meant as
  a format suffix (e.g. `--out erd/file.erd` produced `file.mermaid`/
  `file.dbml` instead of `file.erd.mermaid`/`file.erd.dbml`). An extension is
  now only swapped out when it matches one of the formats actually being
  emitted.
  ([67cded4](https://github.com/NaufalK25/orm2erd/commit/67cded4))
- The interactive "Output path" prompt defaulted to `erd.<first format>` even
  when multiple formats were selected, misleadingly suggesting only one file
  would be written. It now defaults to the bare stem and previews every
  resulting filename (e.g. `writes erd.mermaid, erd.dbml`).
  ([67cded4](https://github.com/NaufalK25/orm2erd/commit/67cded4))
- Sequelize model loading failed on Windows — `tsImport` was passed a raw
  filesystem path instead of a `file://` URL, which Windows paths (with
  drive letters) aren't valid as.
  ([07f472d](https://github.com/NaufalK25/orm2erd/commit/07f472d))

## 🏷️ [1.1.1] - 2026-07-16

### 🚀 Added

- `--type-mode <canonical|native>` flag (and matching interactive prompt) to
  choose whether emitted field types use orm2erd's portable vocabulary
  (`string`, `int`, `datetime`, …) or the ORM's own native type names.
  ([d76b500](https://github.com/NaufalK25/orm2erd/commit/d76b500))
- `-v`/`--version` flag.
  ([b05e9e1](https://github.com/NaufalK25/orm2erd/commit/b05e9e1))
- Prisma detection now resolves `prisma.config.ts`'s `schema` field (the
  source of truth as of Prisma 7), while still surfacing a default
  `schema.prisma`/`prisma/schema.prisma` left on disk alongside it as a
  pickable candidate instead of hiding it.
  ([bd31e9a](https://github.com/NaufalK25/orm2erd/commit/bd31e9a))
- `--verbose` flag: extraction now suppresses `console.log`/`info`/`debug`/`warn`
  output from the target codebase by default (since introspecting Sequelize
  models means executing real project code), and `--verbose` opts back in.
  ([699b598](https://github.com/NaufalK25/orm2erd/commit/699b598))

### 💊 Fixed

- Prisma detection no longer autodiscovers a `prisma/schema` directory (never
  a real Prisma convention) and now recognizes a root-level `schema.prisma`,
  matching Prisma's actual config resolution order.
  ([c18d4e3](https://github.com/NaufalK25/orm2erd/commit/c18d4e3))

## 🏷️ [1.1.0] - 2026-07-15

### 🚀 Added

- Sequelize adapter: introspects `sequelize.models` at runtime (no database
  connection required) to extract fields (types, primary/foreign keys,
  uniqueness, nullability, defaults, enum values) and `1-1`/`1-n`/`n-n`
  relations, deduplicated across both sides of each association.
  ([67a1034](https://github.com/NaufalK25/orm2erd/commit/67a1034))
- Sequelize detector: gates on a `sequelize`/`sequelize-typescript`
  dependency in `package.json`, resolves a custom `.sequelizerc`
  `models-path` when present, and otherwise falls back to conventional
  model directory locations (`models/`, `src/models/`, `db/models/`,
  `app/models/`).
  ([67a1034](https://github.com/NaufalK25/orm2erd/commit/67a1034))
- Recognizes a range of real-world entry-point export shapes — a plain
  named export, the sequelize-cli `db.sequelize` convention, a
  CommonJS-compiled default export, and a Model class's static
  `.sequelize` back-reference — instead of assuming one fixed style.
  ([67a1034](https://github.com/NaufalK25/orm2erd/commit/67a1034))
- Best-effort `.env` loading and a `require()` compatibility shim for entry
  files that mix CommonJS into an otherwise-ESM project, since loading a
  Sequelize model file means executing real project code, not just parsing
  a schema file.
  ([67a1034](https://github.com/NaufalK25/orm2erd/commit/67a1034))
- Test suite (Vitest) covering the Prisma adapter, Sequelize adapter, and
  Mermaid emitter, plus a `coverage` script.
  ([1c95d7d](https://github.com/NaufalK25/orm2erd/commit/1c95d7d))

### 💊 Fixed

- Removed the `typeorm`/`drizzle` placeholders from `--orm` and the ORM
  picker — they were never implemented and only added noise to the CLI's
  option list.
  ([df24e70](https://github.com/NaufalK25/orm2erd/commit/df24e70))
- Primary keys were shown as nullable in Sequelize output — Sequelize
  doesn't set `allowNull` on primary-key columns even though they're
  always `NOT NULL`.
  ([67a1034](https://github.com/NaufalK25/orm2erd/commit/67a1034))
- Many-to-many (`BelongsToMany`) relations were emitted twice, once per
  side, instead of being deduplicated — each side's `foreignKey`/`otherKey`
  pair is swapped relative to the other, which broke the dedup key.
  ([67a1034](https://github.com/NaufalK25/orm2erd/commit/67a1034))

## 🏷️ [1.0.1] - 2026-07-14

### 💊 Fixed

- An active spinner in interactive mode intercepted uncaught errors before
  they could be handled, showing a generic `"Something went wrong"` instead
  of the real cause. `main()` now catches errors around schema loading and
  file writing itself and reports the actual message.
  ([ce2d368](https://github.com/NaufalK25/orm2erd/commit/ce2d368))
- Schemas using Prisma's pre-7 inline datasource properties (`url`,
  `directUrl`, `shadowDatabaseUrl` — moved to `prisma.config.ts` as of
  Prisma 7) failed to parse at all. Since orm2erd never connects to a
  database, these are now stripped before parsing instead of blocking
  extraction — most existing Prisma projects still use this syntax.
  ([56c8e9f](https://github.com/NaufalK25/orm2erd/commit/56c8e9f))

## 🏷️ [1.0.0] - 2026-07-14

### 🚀 Added

- CLI (`orm2erd`) with both an interactive mode (via `@clack/prompts`) and a
  non-interactive mode for CI, driven by `--orm`, `--entry`, `--format`, and
  `--out` flags.
  ([ae9945f](https://github.com/NaufalK25/orm2erd/commit/ae9945f))
- Pluggable ORM detection: a `Detector` registry that scans the project for
  known ORMs. The Prisma detector recognizes both a single `prisma/schema.prisma`
  file and a multi-file `prisma/schema/` directory, and prompts (interactively)
  or errors clearly (non-interactively) when both exist at once.
  ([ae9945f](https://github.com/NaufalK25/orm2erd/commit/ae9945f))
- Prisma adapter that parses `schema.prisma` via `@prisma/internals`
  (`getSchemaWithPath` + `getDMMF`) and normalizes it into a shared
  entity/field/relation intermediate representation.
  ([ae9945f](https://github.com/NaufalK25/orm2erd/commit/ae9945f))
- Field-level metadata: primary keys (including composite `@@id([...])`),
  foreign keys, uniqueness, nullability, list/array fields, enum value lists,
  and default values — including function-call defaults like `now()`,
  `autoincrement()`, and `uuid()`.
  ([ae9945f](https://github.com/NaufalK25/orm2erd/commit/ae9945f))
- Canonical + native type system: each adapter maps its ORM's native type
  names onto a small shared vocabulary (`string`, `int`, `datetime`, `enum`,
  etc.) while preserving the original type name for display (e.g. a
  `@db.Text` column shows as `Text`, not the generic `String`).
  ([ae9945f](https://github.com/NaufalK25/orm2erd/commit/ae9945f))
- Relation extraction with correct `1-1` / `1-n` / `n-n` cardinality derived
  from both sides of each Prisma relation, deduplicated so each relationship
  is emitted exactly once instead of once per field.
  ([ae9945f](https://github.com/NaufalK25/orm2erd/commit/ae9945f))
- Mermaid (`erDiagram`) emitter, rendering field constraints (`PK`/`FK`/`UK`),
  enum values and default values as inline comments, and list-type markers.
  ([ae9945f](https://github.com/NaufalK25/orm2erd/commit/ae9945f))
- Pluggable adapter (`ORMAdapter`) and emitter (`Emitter`) registries so new
  ORMs and output formats can be added without touching detection or any
  other adapter/emitter.
  ([ae9945f](https://github.com/NaufalK25/orm2erd/commit/ae9945f))
- `--out` accepts either a bare base name (format extension auto-appended)
  or a full filename (honored exactly as given for single-format output).
  ([ae9945f](https://github.com/NaufalK25/orm2erd/commit/ae9945f))

### 💊 Fixed

- Composite primary keys (`@@id([...])`) weren't marked as `PK` — only
  single-field `@id` was checked.
  ([4c4a84a](https://github.com/NaufalK25/orm2erd/commit/4c4a84a))
- Each Prisma relation was emitted twice (once per side) with conflicting
  cardinality on the non-list side, instead of once with the correct shape.
  ([4c4a84a](https://github.com/NaufalK25/orm2erd/commit/4c4a84a))
- Falsy default values (`@default(0)`, `@default(false)`) were dropped
  entirely due to a truthiness check instead of an explicit `undefined` check.
  ([ae9945f](https://github.com/NaufalK25/orm2erd/commit/ae9945f))
- `--out` pointing inside a non-existent subdirectory silently wrote to the
  current directory instead of creating the target directory.
  ([ae9945f](https://github.com/NaufalK25/orm2erd/commit/ae9945f))
- `@prisma/internals`'s CJS/ESM interop prevented `getDMMF` from being
  imported as a named export under Node's native ESM loader.
  ([ae9945f](https://github.com/NaufalK25/orm2erd/commit/ae9945f))
- `tsup` was bundling `@prisma/internals` (and its native `fs`-dependent
  code) directly into the CLI output, breaking it at runtime; it's now
  marked external and shipped as a real dependency instead.
  ([cc0ccc1](https://github.com/NaufalK25/orm2erd/commit/cc0ccc1))
