# orm2erd

[![npm version](https://img.shields.io/npm/v/orm2erd.svg)](https://www.npmjs.com/package/orm2erd)
[![CI](https://github.com/NaufalK25/orm2erd/actions/workflows/ci.yml/badge.svg)](https://github.com/NaufalK25/orm2erd/actions/workflows/ci.yml)
[![node](https://img.shields.io/node/v/orm2erd.svg)](https://www.npmjs.com/package/orm2erd)
[![license](https://img.shields.io/npm/l/orm2erd.svg)](./LICENSE)

You already built the app — your ORM models are the schema. `orm2erd` reads them and generates an
ERD (Entity-Relationship Diagram) for you, instead of you drawing and maintaining one by hand.

> **Status:** early development — see the tables below for what's supported today vs. planned.

![orm2erd demo](./.github/assets/demo.gif)

## What it does

`orm2erd` scans your project, figures out which ORM you're using, and turns your existing
models/schema into diagram code — Mermaid, DBML, PlantUML, D2, and more. No manual diagramming,
no drift between your code and your docs.

```
detect ORM → resolve entry point(s) → parse/introspect → normalize to IR → emit diagram code(s) → write file(s)
```

## Supported ORMs

| | ORM | Status |
| --- | --- | --- |
| <img src="./.github/assets/prisma.svg" width="16" height="16" alt="Prisma Icon" style="vertical-align:middle;"> | Prisma | ✅ Supported |
| <img src="./.github/assets/sequelize.svg" width="16" height="16" alt="Sequelize Icon" style="vertical-align:middle;"> | Sequelize | ✅ Supported |
| <img src="./.github/assets/mongoose.svg" width="16" height="16" alt="Mongoose Icon" style="vertical-align:middle;"> | Mongoose | ✅ Supported |
| | TypeORM | 🚧 Planned |
| | Drizzle | 🚧 Planned |
| | MikroORM | 🚧 Planned |
<!-- | | BookShelf.js | 🚧 Planned | -->
<!-- | | Waterline | 🚧 Planned | -->
<!-- | | Objection.js | 🚧 Planned | -->


## Output formats

| | Format | Status |
| --- | --- | --- |
| <img src="./.github/assets/mermaid.svg" width="16" height="16" alt="Mermaid Icon" style="vertical-align:middle;"> | Mermaid | ✅ Supported |
| <img src="./.github/assets/dbml.svg" width="16" height="16" alt="DBML Icon" style="vertical-align:middle;"> | DBML | ✅ Supported |
| <img src="./.github/assets/plantuml.svg" width="16" height="16" alt="PlantUML Icon" style="vertical-align:middle;"> | PlantUML | ✅ Supported |
| <img src="./.github/assets/d2.svg" width="16" height="16" alt="D2 Icon" style="vertical-align:middle;"> | D2 | ✅ Supported |
| <img src="./.github/assets/nomnoml.png" width="16" height="16" alt="nomnoml Icon" style="vertical-align:middle;"> | nomnoml | ✅ Supported |
| | QuickDBD | 🚧 Planned |
| | Graphviz DOT | 🚧 Planned |
| | Structurizr DSL | 🚧 Planned |
| | Pikchr | 🚧 Planned |

## Requirements

Node.js >= 24.

## Installation

Run without installing (recommended — always gets the latest version):

```bash
npx orm2erd
```

Or install globally:

```bash
npm i -g orm2erd
orm2erd
```

## Usage

Interactive:

```bash
npx orm2erd
```

```
┌  orm2erd
│
◇  Detected: prisma
◆  Entry point for prisma:
│  prisma/schema.prisma
◆  Output format(s):
│  mermaid
◆  Output path:
│  erd.mmd
◆  Type labels:
│  Canonical
│
◇  Written to erd.mmd
│
└  Done
```

`erd.mmd`:

```mermaid
erDiagram

%% Entities
  User {
    int id PK "default: autoincrement()"
    string email UK
    string? name
  }

  Post {
    int id PK "default: autoincrement()"
    string title
    string? content
    boolean published "default: false"
    int authorId FK
  }

  Comment {
    int id PK "default: autoincrement()"
    string text
    int postId FK
    int authorId FK
  }

  Tag {
    int id PK "default: autoincrement()"
    string name UK
  }

%% Relationships
  User ||--o{ Post : "posts"
  User ||--o{ Comment : "comments"
  Post ||--o{ Comment : "comments"
  Post }o--o{ Tag : "tags"
```

Non-interactive (CI-friendly):

```bash
npx orm2erd --orm prisma --entry ./prisma/schema.prisma --format mermaid,dbml --out ./erd
```

You can select multiple output formats in a single run — the schema is parsed once and reused
across every format you pick. `--out` accepts either a bare name (`erd`, gets each format's
extension appended) or a full filename (`erd.md`, used exactly as given when there's only one
output format).

By default, field types are emitted in a canonical, portable form (e.g. `string`, `int`). Pass
`--type-mode native` to emit the ORM's own type names instead (e.g. Prisma's `String`, `Int`):

```bash
npx orm2erd --orm prisma --entry ./prisma/schema.prisma --format mermaid --type-mode native
```

### Flags

| Flag | Description |
| --- | --- |
| `--orm <name>` | ORM to use (`prisma`, `sequelize`, `mongoose`). Skips detection. |
| `--entry <path>` | Path to the ORM's schema/model entry. Skips the entry-point prompt. |
| `--format <formats>` | Output format(s), comma-separated (`mermaid`, `dbml`, `plantuml`). |
| `--out <path>` | Output path — bare name gets each format's extension appended; a full filename is used as-is when there's only one format. |
| `--type-mode <mode>` | Type labels to emit: `canonical` (portable, default) or `native` (ORM-specific). |
| `--verbose` | Show log output from the target codebase during extraction (suppressed by default). |
| `-v, --version` | Output the current version. |
| `-h, --help` | Show usage and examples. |

In a TTY, any flag you omit falls back to an interactive prompt. In CI (no TTY, or `CI=true`),
prompts are skipped — pass `--orm`, `--entry`, and `--format` explicitly, or the run exits with an
error telling you which one is missing.

For Prisma, if a `prisma.config.*` file is present, its `schema` field is respected as the entry
point's default candidate, same as the Prisma CLI.

## Why

Diagrams drawn by hand go stale the moment the schema changes. Your ORM already has an accurate,
structured picture of your data model — `orm2erd` just reads that instead of asking you to
redraw it.

## Contributing

See [CLAUDE.md](./CLAUDE.md) for architecture, the adapter/emitter contract, and design decisions.

## License

[MIT](./LICENSE)
