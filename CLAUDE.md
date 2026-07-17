# orm2erd

You already built the app — your ORM models are the schema. orm2erd reads them and generates the
ERD for you, instead of you drawing and maintaining one by hand.

CLI tool that auto-detects which ORM a codebase uses, then generates ERD (Entity-Relationship
Diagram) code from the ORM's models/schema — output to Mermaid, DBML (dbdiagram), PlantUML, D2,
etc. Users can select multiple output formats in a single run.

## Core pipeline

```
detect ORM → resolve entry point(s) → parse/introspect → normalize to IR → emit diagram code(s) → write file(s)
```

## Folder structure

```
src/
  cli.ts
  detect/          # index.ts + one file per ORM
  adapters/        # types.ts + one folder per ORM (prisma/, sequelize/, mongoose/)
  core/model.ts    # the ERDModel IR types
  emitters/        # types.ts + one file per format (mermaid.ts, dbml.ts, plantuml.ts, d2.ts)
bin/
  orm2erd.js       # shebang wrapper: #!/usr/bin/env node → import('../dist/cli.js')
```

**Design principle:** adapters and emitters are pure/swappable. Adding a new ORM or output format
should never require touching detection, other adapters, or other emitters.

## Normalized intermediate representation (IR)

This is the contract between parsing and output. Every adapter produces this; every emitter only
consumes this. Defined in `src/core/model.ts`:

```ts
interface Field {
  name: string;
  type: string;
  isPrimaryKey?: boolean;
  isNullable?: boolean;
  isUnique?: boolean;
}

interface Entity {
  name: string;
  fields: Field[];
}

interface Relation {
  from: string;
  to: string;
  type: '1-1' | '1-n' | 'n-n';
  fieldName?: string;
}

interface ERDModel {
  entities: Entity[];
  relations: Relation[];
}
```

## Key interfaces

```ts
interface Detector {
  name: string;
  detect(cwd: string): Promise<{ found: boolean; suggestedEntry?: string; confidence: number }>;
}

interface ORMAdapter {
  name: string;
  resolveEntry(input: string, cwd: string): Promise<ResolvedEntry>;
  extract(entry: ResolvedEntry): Promise<ERDModel>;
}

interface Emitter {
  format: string;
  emit(model: ERDModel): string;
}
```

## Detection behavior

- Scan `package.json` deps + filesystem signals (e.g. `schema.prisma` presence) for known ORMs:
  Prisma, Sequelize, Mongoose (more later).
- If 0 ORMs detected → prompt user to manually pick (or report "not supported yet").
- If 2+ ORMs detected → show a picker for the user to choose.
- After detection, the user still manually confirms/provides the entry file or model directory:
  - Prisma: `schema.prisma` path
  - Sequelize: model dir + associations file
  - Mongoose: model dir (or a single entry file) — no config file convention to anchor on, so
    detection falls back to scanning file contents for actual `Schema`/`model` calls (see
    `src/detect/mongoose.ts` and the shared matcher in `src/adapters/mongoose/schema-source.ts`)

## Parsing strategy — no regex for extraction

- **Prisma**: static parse via `@prisma/internals` `getDMMF()`. `schema.prisma` is a DSL with an
  official parser already — use it, don't hand-roll one.
- **Sequelize / Mongoose**: runtime introspection. Actually import the user's compiled/ts-node'd
  model files and read the ORM's own already-computed metadata:
  - Sequelize: `sequelize.models` / `.associations`
  - Mongoose: `mongoose.models`, each model's `schema.paths` for fields, and `ref` options for
    relations (no explicit association API like Sequelize's, so cardinality is inferred from
    array-vs-singular paths and `unique`)
  This avoids hand-rolling AST parsers per ORM. Requires `tsx`/`ts-node` to execute user TS files
  at runtime. No DB connection needed — just schema-level metadata.
- Regex is only ever used for cheap pre-checks during detection (e.g. "does this file mention
  `@Entity`"), never for actual field/type/relation extraction.

## Tech stack decisions

- **Language**: TypeScript throughout.
- **CLI framework**: `commander` for flags, `@clack/prompts` for interactive picker/prompts.
- **Runtime for shipping**: Node.js (via npm publish + `bin` field) — NOT Bun, for maximum
  compatibility since users run via `npx`. Bun is optional only for local dev speed (faster
  installs/iteration), but no Bun-only APIs (`Bun.file`, etc.) should leak into shipped source, or
  the package becomes accidentally Bun-only.
- **Prisma parsing dep**: `@prisma/internals`.
- **CLI multi-format support**: `--format mermaid,dbml,plantuml` (comma-separated flag, or
  multi-select in interactive mode). Parse once (expensive), loop over selected emitters (cheap)
  since `ERDModel` is reusable across all emitters.

## CLI UX (target)

```
$ npx orm2erd
→ Scanning project... Detected: Prisma (schema.prisma found)
? Entry point for Prisma: ./prisma/schema.prisma (confirm/edit)
? Output format(s): [x] Mermaid [x] DBML [ ] PlantUML [ ] D2 (multi-select)
? Output path: ./erd
Generating... ✔ Written to ./erd.mmd, ./erd.dbml
```

Non-interactive flags for CI:

```
orm2erd --orm prisma --entry ./schema.prisma --format mermaid,dbml --out ./erd
```
