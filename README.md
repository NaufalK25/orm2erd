# orm2erd

You already built the app — your ORM models are the schema. `orm2erd` reads them and generates an
ERD (Entity-Relationship Diagram) for you, instead of you drawing and maintaining one by hand.

> **Status:** early development. Prisma → Mermaid is functional end to end; everything else below
> is on the roadmap.

![orm2erd demo](./.github/assets/demo.gif)

## What it does

`orm2erd` scans your project, figures out which ORM you're using, and turns your existing
models/schema into diagram code — Mermaid, DBML, PlantUML, D2, and more. No manual diagramming,
no drift between your code and your docs.

```
detect ORM → resolve entry point(s) → parse/introspect → normalize to IR → emit diagram code(s) → write file(s)
```

## Supported ORMs

- ✅ Prisma
- ✅ Sequelize

## Output formats

- ✅ Mermaid

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
│  erd.mermaid
│
◇  Written to erd.mermaid
│
└  Done
```

Non-interactive (CI-friendly):

```bash
npx orm2erd --orm prisma --entry ./prisma/schema.prisma --format mermaid --out ./erd
```

You can select multiple output formats in a single run — the schema is parsed once and reused
across every format you pick. `--out` accepts either a bare name (`erd`, gets each format's
extension appended) or a full filename (`erd.md`, used exactly as given when there's only one
output format).

## Why

Diagrams drawn by hand go stale the moment the schema changes. Your ORM already has an accurate,
structured picture of your data model — `orm2erd` just reads that instead of asking you to
redraw it.

## Contributing

See [CLAUDE.md](./CLAUDE.md) for architecture, the adapter/emitter contract, and design decisions.

## License

[MIT](./LICENSE)
