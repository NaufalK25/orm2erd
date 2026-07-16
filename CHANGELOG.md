# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

### Changed

- Removed the `typeorm`/`drizzle` placeholders from `--orm` and the ORM
  picker — they were never implemented and only added noise to the CLI's
  option list.

### 💊 Fixed

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
