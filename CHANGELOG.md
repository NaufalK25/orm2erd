# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-07-14

### Fixed

- An active spinner in interactive mode intercepted uncaught errors before
  they could be handled, showing a generic `"Something went wrong"` instead
  of the real cause. `main()` now catches errors around schema loading and
  file writing itself and reports the actual message.
- Schemas using Prisma's pre-7 inline datasource properties (`url`,
  `directUrl`, `shadowDatabaseUrl` — moved to `prisma.config.ts` as of
  Prisma 7) failed to parse at all. Since orm2erd never connects to a
  database, these are now stripped before parsing instead of blocking
  extraction — most existing Prisma projects still use this syntax.

## [1.0.0] - 2026-07-14

### Added

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

### Fixed

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
