# orm2erd

You already built the app — your ORM models are the schema. orm2erd reads them and generates the
ERD for you, instead of you drawing and maintaining one by hand.

CLI tool that auto-detects which ORM a codebase uses, then generates ERD (Entity-Relationship
Diagram) code from the ORM's models/schema — output to Mermaid, DBML, PlantUML, D2, etc. Users can
select multiple output formats in a single run. See [README.md](./README.md) for the current list
of supported ORMs and output formats — don't duplicate that list here, it changes independently of
this file's architecture-level content.

For user-facing docs (flags, CI usage, examples) see [README.md](./README.md). For an exhaustive
per-ORM deep dive into detection and parsing, see [docs/adapters.md](./docs/adapters.md) — this
file stays at the architecture level and doesn't duplicate that detail.

## Core pipeline

```
detect ORM → resolve entry point(s) → parse/introspect → normalize to IR → emit diagram code(s) → write file(s)
```

## Folder structure

```
src/
  cli.ts             # commander flags + main(); wires src/cli/* together, no logic of its own
  cli/
    render.ts        # icon/orExit/renderDiff — pure terminal-rendering helpers, no I/O
    resolve.ts        # resolveORM/resolveEntryPath/resolveFormats/resolveTypeMode/resolveOutBase
                       # (prompt-or-flag resolution, one function per CLI concern)
    run.ts             # generateAndWrite: phase reporter (spinner/status lines) + the
                        # check/stdout/copy/write-file execution paths
  detect/            # index.ts (registry + detectORMs) + one file per ORM + shared.ts (scan helpers)
  adapters/          # types.ts (ORMAdapter/ResolvedEntry) + index.ts (registry) + one folder per ORM
  core/
    model.ts         # the ERDModel IR types
    orm.ts            # ORMName union
    format.ts         # OutputFormat/TypeMode unions
    check.ts           # --check: diff a regenerated model against the file on disk
    model-diff.ts        # --check --summary: structural (ERDModel-level) diff + gitignored JSON snapshot read/write
    dotenv.ts          # best-effort .env/.env.local loading before runtime introspection
    guard-exit.ts       # traps a target entry file calling process.exit() during import
    suppress-output.ts  # silences the target codebase's own console/stdout noise during extract()
    import-hints.ts      # maps common import failures to actionable hints
    grid-multiselect.ts   # custom @clack/core prompt for the format multi-select
    package.ts             # package.json reading helper
    case-transform.ts       # toCase(): letter-casing for --case, source-casing-agnostic
    inflect.ts                # applyInflect(): pluralize/singularize for --inflect (via `inflection`)
  emitters/          # types.ts (Emitter/EmitOptions) + index.ts (registry) + one file per format
                      # (mermaid.ts, dbml.ts, plantuml.ts, d2.ts, etc)
                      # + label.ts/uniques.ts/names.ts (shared rendering helpers)
                      # + quote.ts (hasSpace/hasHyphen — per-emitter conditional quoting)
bin/
  orm2erd.js       # shebang wrapper: #!/usr/bin/env node → import('../dist/cli.js')
test/              # vitest, mirrors src/ (detect/, adapters/, core/, emitters/) + test/e2e/
docs/
  adapters.md      # per-ORM detection/parsing deep dive
```

**Design principle:** adapters and emitters are pure/swappable. Adding a new ORM or output format
should never require touching detection, other adapters, or other emitters.

## Normalized intermediate representation (IR)

This is the contract between parsing and output. Every adapter produces this; every emitter only
consumes this. Defined in `src/core/model.ts`:

```ts
type CanonicalType =
  | "string" | "int" | "float" | "decimal" | "boolean" | "datetime"
  | "json" | "bytes" | "bigint" | "enum" | "unknown";

interface Field {
  name: string;
  columnName?: string;    // physical column name, only set when it differs from `name`
  type: CanonicalType;
  nativeType: string;     // the ORM's own type name
  isList?: boolean;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  isNullable?: boolean;
  isUnique?: boolean;
  defaultValue?: string;
  enumValues?: string[];
  description?: string;   // free-text doc comment (Prisma `///`, Sequelize/TypeORM `comment`)
}

interface Index {
  fields: string[];
  isUnique?: boolean;
  name?: string;
}

type RelationAction = "cascade" | "restrict" | "set null" | "no action" | "set default";

interface Entity {
  name: string;
  tableName?: string;     // physical table/collection name, only set when it differs from `name`
  fields: Field[];
  description?: string;
  primaryKey?: string[];  // composite PK member columns, only set when length > 1
  uniques?: string[][];   // composite unique constraints (length > 1 each)
  indexes?: Index[];      // plain (non-unique) indexes only
}

interface Relation {
  from: string;
  to: string;
  type: "1-1" | "1-n" | "n-n";
  fieldName?: string;
  // The FK-holding side isn't fixed by `type` — `to` is always the FK-holding
  // side, resolved per relation by each adapter (both omitted when unresolvable,
  // e.g. implicit many-to-many join tables).
  fromColumn?: string;
  toColumn?: string;
  onDelete?: RelationAction;
  onUpdate?: RelationAction;
  isFromOptional?: boolean; // whether the FK column on the `to` side is nullable
}

interface ERDModel {
  entities: Entity[];
  relations: Relation[];
}
```

Single-column PK/unique stay on the per-field flags; the entity-level `primaryKey`/`uniques`/
`indexes` arrays only ever carry what a per-field boolean can't express (composite/multi-column
groupings, or plain lookup indexes). `Relation.to` is always the FK-holding side across every
adapter and relation type — fixed invariant, don't special-case a `from`-holds-FK path.

## Key interfaces

```ts
interface DetectResult {
  found: boolean;
  candidates: string[]; // candidate entry paths the detector noticed
  confidence: number;   // 0-1; used to pick a default when multiple ORMs are detected
}

interface Detector {
  name: ORMName;
  detect(cwd: string): Promise<DetectResult>;
}

interface ResolvedEntry {
  path: string;
}

interface ORMAdapter {
  name: ORMName;
  resolveEntry(input: string, cwd: string): Promise<ResolvedEntry>;
  extract(entry: ResolvedEntry): Promise<ERDModel>;
}

interface EmitOptions {
  typeMode: TypeMode; // "canonical" | "native"
  nameMode?: NameMode; // "model" | "table" | "both" — defaults to "model" when omitted
  relationLabelMode?: RelationLabelMode; // "alias" | "column" | "both" — defaults to "both" when omitted
  caseMode?: CaseMode; // letter-casing for rendered identifiers — defaults to "preserve" when omitted
  inflectMode?: InflectMode; // pluralization for entity/table identifiers only — defaults to "preserve" when omitted
}

interface Emitter {
  format: OutputFormat;
  fileExtension: string; // used when deriving an output path from a bare `--out` name
  emit(model: ERDModel, options: EmitOptions): string; // pure — no filesystem access
}
```

## Detection behavior

- Each detector checks `package.json` deps first; a missing dependency short-circuits to
  `found: false` before any filesystem scanning.
- Detectors return `candidates: string[]`, not a single guess — a config-file-driven ORM
  (Prisma, Drizzle) usually returns exactly one; others can return several equally-plausible
  paths (e.g. Prisma with both a `prisma.config.*`-resolved schema and a default
  `prisma/schema.prisma` on disk). `confidenceFromCandidates()` (`src/detect/shared.ts`) scores a
  single candidate as certain (`1`) and N candidates as an even split of that certainty (`1/N`,
  e.g. `0.5` for two, `0.33` for three), since each is an equally-plausible guess.
- If 0 ORMs detected → prompt the user to manually pick one (non-interactive: error, exit 1).
- If 2+ ORMs detected → show a picker (non-interactive: error asking for `--orm`).
- If the resolved ORM has multiple entry candidates → show a picker (non-interactive: error
  asking for `--entry`).
- Entry-point conventions per ORM (config file vs. model directory vs. content-scan fallback)
  are detailed in [docs/adapters.md](./docs/adapters.md) — they differ enough per ORM (Prisma's
  `prisma.config.*`, Sequelize's `.sequelizerc`, Mongoose/TypeORM's content-scan fallback via
  `findFilesByContent`, Drizzle's `drizzle.config.*`) that duplicating them here would just drift.

## Parsing strategy — no regex for extraction

- **Prisma**: the only adapter that's a static parse, no code execution — `@prisma/internals`'s
  `getSchemaWithPath()` + `getDMMF()`. `schema.prisma` is a DSL with an official parser already —
  use it, don't hand-roll one.
- **Sequelize / Mongoose / TypeORM / Drizzle**: runtime introspection via `tsx`'s `tsImport()` —
  actually import the target project's own model/config files and read the ORM's own
  already-computed metadata (`sequelize.models`/`.associations`, `mongoose.models[].schema.paths`,
  TypeORM's internal `ConnectionMetadataBuilder`, `drizzle-orm`'s `getTableConfig()`). This avoids
  hand-rolling an AST parser per ORM. No DB connection needed — just schema-level metadata; entry
  files that call `process.exit()` (e.g. on a failed DB connect) are trapped by
  `withGuardedExit` and turned into a catchable error instead of killing the CLI.
  - TypeORM specifically needs its `.ts` entities compiled with the *target project's own*
    `typescript` + `tsconfig.json` first (real `tsc`, not esbuild) — its decorators need
    `experimentalDecorators`/`emitDecoratorMetadata`, which esbuild's transform doesn't support.
  - Sequelize/Mongoose/TypeORM resolve their duck-typed instance (Sequelize instance, Mongoose
    module, `DataSource`) by searching the imported module's exports up to 3 levels deep, since
    export shape varies a lot across real codebases.
  - See [docs/adapters.md](./docs/adapters.md) for the full per-ORM extraction details (composite
    keys, indexes, relation-cardinality inference, relation actions, etc).
- Regex is only ever used for cheap pre-checks during detection (e.g. "does this file mention
  `@Entity`" or Mongoose's schema-source matcher), never for actual field/type/relation
  extraction.

## Tech stack decisions

- **Language**: TypeScript throughout.
- **CLI framework**: `commander` for flags, `@clack/prompts` for interactive picker/prompts (plus
  a hand-rolled `@clack/core`-based grid multi-select for output-format selection).
- **Config resolution**: `c12` for Prisma's `prisma.config.*` lookup (mirrors Prisma's own CLI
  resolution order).
- **Build**: `tsup` for the JS bundle + `tsc` (via `tsconfig.build.json`) for `.d.ts` output.
- **Lint/format**: `oxlint` + `prettier`.
- **Tests**: `vitest`, mirroring `src/` under `test/` (`test/e2e/pipeline.test.ts` runs the full
  pipeline against fixture projects).
- **Runtime for shipping**: Node.js (via npm publish + `bin` field) — NOT Bun, for maximum
  compatibility since users run via `npx`. Bun is optional only for local dev speed (faster
  installs/iteration), but no Bun-only APIs (`Bun.file`, etc.) should leak into shipped source, or
  the package becomes accidentally Bun-only.
- **Prisma parsing dep**: `@prisma/internals`.
- **Clipboard dep**: `clipboardy`, used by `--copy` (pure-JS, no native deps, cross-platform
  including WSL).
- **CLI multi-format support**: `--format mermaid,dbml,plantuml` (comma-separated flag, or
  multi-select in interactive mode). Parse once (expensive), loop over selected emitters (cheap)
  since `ERDModel` is reusable across all emitters.

## CLI flags

```
orm2erd --orm prisma --entry ./schema.prisma --format mermaid,dbml --out ./erd
```

| Flag | Purpose |
| --- | --- |
| `--orm <name>` | Skip detection, use this ORM directly. |
| `--entry <path>` | Skip the entry-point prompt/candidate resolution. |
| `--format <formats>` | Comma-separated output format(s), or `all` for every registered emitter; defaults to `mermaid` non-interactively. |
| `--out <path>` | Bare name gets each format's extension appended; a full filename is used as-is when there's exactly one format. A directory (trailing slash, or an existing directory) writes `erd.<ext>` inside it — see `src/core/out-path.ts`. |
| `--type-mode <mode>` | `canonical` (default, portable) or `native` (ORM-specific type names) field-type labels. |
| `--names <mode>` | `table` (default, physical table/column names), `model` (ORM model/field names), or `both` (physical name + ORM name as an alias where the format supports one) — see `src/emitters/names.ts`. |
| `--relation-label <mode>` | `both` (default — alias, plus the FK column when it disambiguates two relations between the same entity pair), `alias`, or `column` — see `src/emitters/label.ts`. |
| `--case <mode>` | Letter-casing for rendered identifiers: `preserve` (default, source casing as-is), `snake`, `screaming_snake`, `camel`, `pascal`, `kebab`, `title`, `lower`, or `upper`. Only touches identifiers (entity/field/enum-type names) — never type labels, enum member values, or the `--names both` alias — see `src/core/case-transform.ts`. Some emitters conditionally quote an identifier that becomes syntactically unsafe after casing (a bare hyphen/space) — see `src/emitters/quote.ts`. |
| `--inflect <mode>` | Pluralization for **entity/table identifiers only** (never fields, never the `--names both` alias): `preserve` (default, source number as-is), `plural`, or `singular` — via the `inflection` package, applied before `--case` (`--inflect plural --case kebab` on `PostTag` → `post-tags`) — see `src/core/inflect.ts`. |
| `--check` | Regenerate in-memory and diff against the file(s) already on disk; writes nothing, exits non-zero on drift/missing — see `src/core/check.ts`. Does NOT force non-interactive by itself — run from a TTY, ORM/entry/`--out`/etc. ambiguity all still prompt normally. `--out` is still always required, but never via a silently-accepted guess: non-interactively it's a hard error checked before any prompting starts (`validateCheckRequiresOut`), interactively it's a dedicated prompt with no pre-fillable default (`resolveOutBase`'s `check` param) — see `src/cli/resolve.ts`. |
| `--summary` | With `--check`, print a structural (schema-level) diff grouped by entity (e.g. `users: +column "last_login_at"`) instead of the raw line diff, by comparing the freshly-extracted `ERDModel` against a gitignored `<out>.orm2erd-model.json` snapshot written alongside the diagram on the last non-`--check` run — see `src/core/model-diff.ts`. Falls back to the raw line diff (with an explanatory note) when no snapshot exists yet (e.g. first run, or a CI checkout with no prior local run — the snapshot is a local cache, not committed) or when the drift is formatting/ordering-only (no structural difference to show). Requires `--check`. |
| `--stdout` | Print the diagram to stdout instead of writing a file; requires exactly one `--format`. Forces non-interactive so prompt chrome never lands on the stdout stream; status/log lines are routed to stderr so the stream stays clean for piping. |
| `--copy` | Copy the diagram to the clipboard instead of writing a file; requires exactly one `--format`. Uses `clipboardy`; stays interactive (spinner/intro/outro) since it never touches stdout. |
| `--verbose` | Don't suppress the target codebase's own console/stdout output during `extract()`. |
| `-y, --yes` | Forces `interactive = false` in `src/cli.ts` (same as `--stdout`/CI), so every omitted flag falls back to its non-interactive default instead of prompting. Reuses the existing default-value branch in each `resolve*` function in `src/cli/resolve.ts` — no separate default-value plumbing. |

In a TTY (and not CI, not `--stdout`, not `-y`/`--yes`), any omitted flag falls back to an
interactive `@clack/prompts` flow instead of a hard default — including `--out` on a `--check` run,
whose prompt (unlike a plain write's) has no pre-fillable default, so it can't be satisfied by
blindly hitting Enter. See [README.md](./README.md#flags) for the full flag reference and CI
examples.
