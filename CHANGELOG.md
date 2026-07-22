# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- **QuickDBD output** (`--format quickdbd`), emitting dbdiagram.io's QuickDBD
  syntax with inline `PK`/`FK`/`UNIQUE`/`NULL` field constraints — QuickDBD
  has no separate relationship section, so the FK marker sits directly on
  whichever field physically holds the key — plus enum/default values as
  trailing `#` comments.
- Colorized CLI output (help text, prompts, success/error messages) via
  `picocolors`, plus an icon on each interactive step (detection, entry
  point, format, output path, type mode, generating, result). Both color and
  icons auto-disable in environments without color/Unicode support (CI,
  `NO_COLOR`, non-UTF8 terminals), using the same detection heuristic
  `@clack/prompts` already relies on for its own prompt symbols — falling
  back to plain ASCII (`o`/`x`) for status icons and to nothing for purely
  decorative ones.

### 💊 Fixed

- The Mermaid emitter's `%% Entities`/`%% Relationships` section comments
  weren't indented to match the rest of the diagram body.

## 🏷️ [1.4.0] - 2026-07-20

### 🚀 Added

- **D2 output** (`--format d2`), emitting `sql_table`-shaped nodes with
  `pk`/`fk`/`unique` field constraints, `NOT NULL`/`DEFAULT ...` inline
  comments, and crow's-foot cardinality via `cf-one`/`cf-many` arrowhead
  shapes on `<->` connections (D2 has no inline symbol for it like
  Mermaid/DBML). Identifiers are always quoted to sidestep D2's reserved
  top-level keywords (`shape`, `style`, `layers`, …).
- **nomnoml output** (`--format nomnoml`), emitting `<table>`-classifier
  nodes with `PK`/`FK`/`unique`/`NN` field tags and `1 -- 1`/`1 -- *`/`* -- *`
  multiplicity relations.
- Every emitter now separates entities and relationships with an
  `// Entities` / `// Relationships` heading (or the format's own comment
  syntax) and a blank line between entity blocks, instead of one unbroken
  stream of lines.

### 💊 Fixed

- Target codebases whose entry file logs straight to `process.stdout`/
  `process.stderr` (e.g. pino, morgan, winston's default console transport)
  instead of going through `console.*` leaked that output past
  `--verbose`'s suppression, since only `console.*` was being patched. Both
  streams are now patched too.
- The CLI could hang after a successful run instead of exiting — importing
  the target codebase to introspect it (a DB connection, timers, etc.) can
  leave open handles that hold Node's event loop open forever. The process
  now exits explicitly once output is written.
- `Sequelize.literal(...)` default values (e.g. `nextval('posts_id_seq')`
  for a Postgres sequence default) were resolved to the wrapper's
  constructor name instead of the actual SQL expression — the fallback for
  sentinel `DataTypes` instances (`UUIDV4`, `NOW`, …) matched it too, since
  both are property-less class instances. `Literal`'s wrapped `val` is now
  read directly instead.
- A default value containing a double quote (e.g. a JSON default like
  `{"a":""}`) broke the emitted DBML/Mermaid output by prematurely closing
  the surrounding quoted attribute. Embedded double quotes are now escaped
  to single quotes before emitting, consistent with how string defaults are
  already handled elsewhere.

## 🏷️ [1.3.0] - 2026-07-17

### 🚀 Added

- **Mongoose support.** Detection scans model files for `Schema`/`model`
  calls (no config-file convention to anchor on like Prisma's
  `schema.prisma` or Sequelize's model dir), and extraction runs the user's
  compiled/ts-node'd model files at runtime to read `mongoose.models` and
  each schema's `paths`. Relations are inferred from `ref` options, with
  cardinality read off array-vs-singular paths and `unique`.
- **PlantUML output** (`--format plantuml`), emitting entity-relationship
  syntax with crow's-foot notation (`hide circle`,
  `skinparam linetype ortho`), matching the existing Mermaid/DBML emitters.

### 💊 Fixed

- The Mermaid emitter wrote files with a `.mermaid` extension, which few
  editors or GitHub recognize for syntax highlighting. It now uses `.mmd`,
  the extension actually recognized by the Mermaid CLI, Live Editor, and
  GitHub/GitLab's native rendering.
- DBML enum values were emitted unquoted (e.g. `admin`), which broke for
  values containing spaces, dashes, or other symbols (e.g. `in-progress`,
  `pending review`) since DBML parses an unquoted value as a bare
  identifier. Values are now wrapped in double quotes (`"in-progress"`),
  matching DBML's actual enum syntax.
- The DBML table emitter's closing `}` was indented two spaces, inconsistent
  with every other emitted line.
- Sequelize default values that are sentinel `DataTypes` instances (e.g.
  `DataTypes.UUIDV4`, `DataTypes.NOW`) have no own properties, so
  `JSON.stringify` on them just produced `"{}"`. These now fall back to the
  constructor name (e.g. `UUIDV4()`), matching how column types are already
  resolved, with `()` appended to signal it's generated rather than a
  literal.

## 🏷️ [1.2.3] - 2026-07-17

### 🚀 Added

- Sequelize extraction now also auto-loads a `.env.local` file (in addition
  to `.env`) from the project root before running, matching the common
  Next.js-style local-env convention. This is best-effort: it just makes
  those variables available to the entry file while it loads, in case the
  target codebase validates env vars (e.g. for DB config) at import time.

### 💊 Fixed

- A target entry file calling `process.exit()` while orm2erd was loading it
  (e.g. on a failed DB connection attempt) killed the whole CLI before our
  own error handling ever saw it, showing a misleading "Canceled" instead of
  a real error. It's now caught and surfaced as a normal, readable error.
- The release workflow's "is this commit newly tagged" check compared an
  annotated tag's own object SHA (what `git rev-parse refs/tags/vX.Y.Z`
  returns) against the commit SHA, which never match — so it always
  concluded the tag wasn't new and silently skipped the release. The tag is
  now peeled to the commit it points at before comparing.

## 🏷️ [1.2.2] - 2026-07-17

### 💊 Fixed

- Sequelize model loading failed with `__dirname is not defined in ES module
  scope` on entry files (e.g. sequelize-cli's generated `models/index.js`,
  or a TS port of it) that reference `__filename`/`__dirname`/`require` at
  module scope. Those CJS globals are now polyfilled before the file loads,
  matching the `require` polyfill already in place.

## 🏷️ [1.2.1] - 2026-07-16

### 💊 Fixed

- Release tags were being created as `v.X.Y.Z` (with a stray dot) instead of
  the standard `vX.Y.Z`. The auto-tag and release workflows now produce
  correctly formatted tags, and existing `v.*` tags have been replaced with
  `v*` equivalents.
- Release workflow now publishes to npm via trusted-publisher OIDC instead of
  a long-lived `NPM_TOKEN` secret.
- The release workflow could fail to run after Auto Tag completed on a push
  that didn't actually create a new tag, or miss a run entirely; it's now
  chained more reliably off Auto Tag's completion, with `workflow_dispatch`
  as a manual fallback that skips the tag/commit match check.

## 🏷️ [1.2.0] - 2026-07-16

### 🚀 Added

- DBML emitter (`--format dbml`): tables with field constraints (`pk`,
  `unique`, `not null`, `default: ...`), `Ref:` relation lines derived from
  each relation's actual FK column on both sides, and `Enum` blocks for
  enum-typed fields.
- GitHub Actions CI (tests + lint on push/PR) and an automated release-tag
  workflow that tags a version whenever it changes on `package.json`.

### 💊 Fixed

- `--out` with multiple formats stripped *any* extension already on the base
  path and replaced it per emitter, even when that extension wasn't meant as
  a format suffix (e.g. `--out erd/file.erd` produced `file.mermaid`/
  `file.dbml` instead of `file.erd.mermaid`/`file.erd.dbml`). An extension is
  now only swapped out when it matches one of the formats actually being
  emitted.
- The interactive "Output path" prompt defaulted to `erd.<first format>` even
  when multiple formats were selected, misleadingly suggesting only one file
  would be written. It now defaults to the bare stem and previews every
  resulting filename (e.g. `writes erd.mermaid, erd.dbml`).
- Sequelize model loading failed on Windows — `tsImport` was passed a raw
  filesystem path instead of a `file://` URL, which Windows paths (with
  drive letters) aren't valid as.

## 🏷️ [1.1.1] - 2026-07-16

### 🚀 Added

- `--type-mode <canonical|native>` flag (and matching interactive prompt) to
  choose whether emitted field types use orm2erd's portable vocabulary
  (`string`, `int`, `datetime`, …) or the ORM's own native type names.
- `-v`/`--version` flag.
- Prisma detection now resolves `prisma.config.ts`'s `schema` field (the
  source of truth as of Prisma 7), while still surfacing a default
  `schema.prisma`/`prisma/schema.prisma` left on disk alongside it as a
  pickable candidate instead of hiding it.
- `--verbose` flag: extraction now suppresses `console.log`/`info`/`debug`/`warn`
  output from the target codebase by default (since introspecting Sequelize
  models means executing real project code), and `--verbose` opts back in.

### 💊 Fixed

- Prisma detection no longer autodiscovers a `prisma/schema` directory (never
  a real Prisma convention) and now recognizes a root-level `schema.prisma`,
  matching Prisma's actual config resolution order.

## 🏷️ [1.1.0] - 2026-07-15

### 🚀 Added

- Sequelize adapter: introspects `sequelize.models` at runtime (no database
  connection required) to extract fields (types, primary/foreign keys,
  uniqueness, nullability, defaults, enum values) and `1-1`/`1-n`/`n-n`
  relations, deduplicated across both sides of each association.
- Sequelize detector: gates on a `sequelize`/`sequelize-typescript`
  dependency in `package.json`, resolves a custom `.sequelizerc`
  `models-path` when present, and otherwise falls back to conventional
  model directory locations (`models/`, `src/models/`, `db/models/`,
  `app/models/`).
- Recognizes a range of real-world entry-point export shapes — a plain
  named export, the sequelize-cli `db.sequelize` convention, a
  CommonJS-compiled default export, and a Model class's static
  `.sequelize` back-reference — instead of assuming one fixed style.
- Best-effort `.env` loading and a `require()` compatibility shim for entry
  files that mix CommonJS into an otherwise-ESM project, since loading a
  Sequelize model file means executing real project code, not just parsing
  a schema file.
- Test suite (Vitest) covering the Prisma adapter, Sequelize adapter, and
  Mermaid emitter, plus a `coverage` script.

### 💊 Fixed

- Removed the `typeorm`/`drizzle` placeholders from `--orm` and the ORM
  picker — they were never implemented and only added noise to the CLI's
  option list.
- Primary keys were shown as nullable in Sequelize output — Sequelize
  doesn't set `allowNull` on primary-key columns even though they're
  always `NOT NULL`.
- Many-to-many (`BelongsToMany`) relations were emitted twice, once per
  side, instead of being deduplicated — each side's `foreignKey`/`otherKey`
  pair is swapped relative to the other, which broke the dedup key.

## 🏷️ [1.0.1] - 2026-07-14

### 💊 Fixed

- An active spinner in interactive mode intercepted uncaught errors before
  they could be handled, showing a generic `"Something went wrong"` instead
  of the real cause. `main()` now catches errors around schema loading and
  file writing itself and reports the actual message.
- Schemas using Prisma's pre-7 inline datasource properties (`url`,
  `directUrl`, `shadowDatabaseUrl` — moved to `prisma.config.ts` as of
  Prisma 7) failed to parse at all. Since orm2erd never connects to a
  database, these are now stripped before parsing instead of blocking
  extraction — most existing Prisma projects still use this syntax.

## 🏷️ [1.0.0] - 2026-07-14

### 🚀 Added

- CLI (`orm2erd`) with both an interactive mode (via `@clack/prompts`) and a
  non-interactive mode for CI, driven by `--orm`, `--entry`, `--format`, and
  `--out` flags.
- Pluggable ORM detection: a `Detector` registry that scans the project for
  known ORMs. The Prisma detector recognizes both a single `prisma/schema.prisma`
  file and a multi-file `prisma/schema/` directory, and prompts (interactively)
  or errors clearly (non-interactively) when both exist at once.
- Prisma adapter that parses `schema.prisma` via `@prisma/internals`
  (`getSchemaWithPath` + `getDMMF`) and normalizes it into a shared
  entity/field/relation intermediate representation.
- Field-level metadata: primary keys (including composite `@@id([...])`),
  foreign keys, uniqueness, nullability, list/array fields, enum value lists,
  and default values — including function-call defaults like `now()`,
  `autoincrement()`, and `uuid()`.
- Canonical + native type system: each adapter maps its ORM's native type
  names onto a small shared vocabulary (`string`, `int`, `datetime`, `enum`,
  etc.) while preserving the original type name for display (e.g. a
  `@db.Text` column shows as `Text`, not the generic `String`).
- Relation extraction with correct `1-1` / `1-n` / `n-n` cardinality derived
  from both sides of each Prisma relation, deduplicated so each relationship
  is emitted exactly once instead of once per field.
- Mermaid (`erDiagram`) emitter, rendering field constraints (`PK`/`FK`/`UK`),
  enum values and default values as inline comments, and list-type markers.
- Pluggable adapter (`ORMAdapter`) and emitter (`Emitter`) registries so new
  ORMs and output formats can be added without touching detection or any
  other adapter/emitter.
- `--out` accepts either a bare base name (format extension auto-appended)
  or a full filename (honored exactly as given for single-format output).

### 💊 Fixed

- Composite primary keys (`@@id([...])`) weren't marked as `PK` — only
  single-field `@id` was checked.
- Each Prisma relation was emitted twice (once per side) with conflicting
  cardinality on the non-list side, instead of once with the correct shape.
- Falsy default values (`@default(0)`, `@default(false)`) were dropped
  entirely due to a truthiness check instead of an explicit `undefined` check.
- `--out` pointing inside a non-existent subdirectory silently wrote to the
  current directory instead of creating the target directory.
- `@prisma/internals`'s CJS/ESM interop prevented `getDMMF` from being
  imported as a named export under Node's native ESM loader.
- `tsup` was bundling `@prisma/internals` (and its native `fs`-dependent
  code) directly into the CLI output, breaking it at runtime; it's now
  marked external and shipped as a real dependency instead.
