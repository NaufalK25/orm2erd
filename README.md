# orm2erd

You already built the app — your ORM models are the schema. `orm2erd` reads them and generates an
ERD (Entity-Relationship Diagram) for you, instead of you drawing and maintaining one by hand.

> **Status:** early development, pre-release. Not yet published to npm.

## What it does

`orm2erd` scans your project, figures out which ORM you're using, and turns your existing
models/schema into diagram code — Mermaid, DBML, PlantUML, D2, and more. No manual diagramming,
no drift between your code and your docs.

```
detect ORM → resolve entry point → parse/introspect models → generate diagram code → write file(s)
```

## Supported ORMs (target)

- Prisma
- TypeORM
- Sequelize
- Drizzle

## Output formats (target)

- Mermaid
- DBML (dbdiagram.io)
- PlantUML
- D2

## Usage

Interactive:

```bash
npx orm2erd
```

```
→ Scanning project... Detected: Prisma (schema.prisma found)
? Entry point for Prisma: ./prisma/schema.prisma (confirm/edit)
? Output format(s): [x] Mermaid [x] DBML [ ] PlantUML [ ] D2
? Output path: ./erd
Generating... ✔ Written to ./erd.mermaid.md, ./erd.dbml
```

Non-interactive (CI-friendly):

```bash
npx orm2erd --orm prisma --entry ./schema.prisma --format mermaid,dbml --out ./erd
```

You can select multiple output formats in a single run — the schema is parsed once and reused
across every format you pick.

## Why

Diagrams drawn by hand go stale the moment the schema changes. Your ORM already has an accurate,
structured picture of your data model — `orm2erd` just reads that instead of asking you to
redraw it.

## Contributing

See [CLAUDE.md](./CLAUDE.md) for architecture, the adapter/emitter contract, and design decisions.

## License

[MIT](./LICENSE)
