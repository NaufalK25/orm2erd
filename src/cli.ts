import { Command } from "commander";
import { writeFile } from "node:fs/promises";
import { extname } from "node:path";
import {
  intro,
  outro,
  text,
  select,
  multiselect,
  spinner,
  isCancel,
  cancel,
  log,
  isTTY,
  isCI,
} from "@clack/prompts";
import { detectORMs } from "./detect";
import { getAdapter } from "./adapters";
import { emitters, getEmitter } from "./emitters";
import type { OutputFormat } from "./core/format";
import type { ORMName } from "./core/orm";

const ALL_ORM_NAMES: ORMName[] = ["prisma", "typeorm", "sequelize", "drizzle"];

const program = new Command();

program
  .name("orm2erd")
  .description(
    "Generate an ERD from your ORM's models/schema — no manual diagramming.",
  )
  .option("--orm <name>", "ORM to use (prisma, typeorm, sequelize, drizzle)")
  .option("--entry <path>", "path to the ORM's schema/model entry")
  .option(
    "--format <formats>",
    "output format(s), comma-separated (mermaid, dbml, plantuml, d2)",
  )
  .option(
    "--out <path>",
    "output path — a full filename (e.g. erd.md) is used as-is; a bare name (e.g. erd) gets the format's extension appended",
  )
  .addHelpText(
    "after",
    `
Examples:
  $ orm2erd
  $ orm2erd --orm prisma --entry ./prisma/schema.prisma --format mermaid,dbml --out ./erd`,
  )
  .parse();

const opts = program.opts();

// Unwraps a clack prompt result, exiting cleanly on Ctrl+C instead of
// letting the cancel symbol leak into the rest of the pipeline.
function orExit<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel("Cancelled.");
    process.exit(0);
  }
  return value;
}

function resolveOutPath(
  base: string,
  extension: string,
  outputCount: number,
): string {
  const ext = extname(base);
  if (ext && outputCount === 1) {
    return base;
  }
  const stem = ext ? base.slice(0, -ext.length) : base;
  return `${stem}.${extension}`;
}

async function main() {
  const cwd = process.cwd();
  const interactive = isTTY(process.stdout) && !isCI();

  if (interactive) intro("orm2erd");

  const skipDetection = Boolean(opts.orm) && Boolean(opts.entry);
  const detected = skipDetection ? [] : await detectORMs(cwd);

  let ormName: ORMName | undefined = opts.orm;
  let entryCandidates: string[] = [];

  if (!ormName) {
    if (detected.length === 1) {
      ormName = detected[0].name;
      entryCandidates = detected[0].candidates;
      if (interactive) {
        log.step(`Detected: ${ormName}`);
      }
    } else if (detected.length > 1) {
      if (!interactive) {
        console.error(
          `Multiple ORMs detected (${detected.map((d) => d.name).join(", ")}). Pass --orm <name> to specify one.`,
        );
        process.exit(1);
      }
      ormName = orExit(
        await select({
          message: "Multiple ORMs detected — which one?",
          options: detected.map((d) => ({
            value: d.name,
            label: d.name,
            hint: `confidence ${d.confidence}`,
          })),
        }),
      );
      entryCandidates =
        detected.find((d) => d.name === ormName)?.candidates ?? [];
    } else {
      if (!interactive) {
        console.error(
          "No supported ORM detected. Pass --orm <name> to specify one manually.",
        );
        process.exit(1);
      }
      ormName = orExit(
        await select({
          message: "No ORM detected. Which one are you using?",
          options: ALL_ORM_NAMES.map((name) => ({ value: name, label: name })),
        }),
      );
    }
  } else {
    entryCandidates =
      detected.find((d) => d.name === ormName)?.candidates ?? [];
  }

  const adapter = getAdapter(ormName);

  let entryPath: string | undefined = opts.entry;
  if (!entryPath) {
    if (entryCandidates.length > 1) {
      // Ambiguous: e.g. Prisma with both a single schema.prisma and a
      // multi-file prisma/schema/ directory present at once.
      if (interactive) {
        entryPath = orExit(
          await select({
            message: `Multiple schema locations found for ${ormName} — which one?`,
            options: entryCandidates.map((c) => ({ value: c, label: c })),
          }),
        );
      } else {
        console.error(
          `Multiple possible entry points found for ${ormName}:\n` +
            entryCandidates.map((c) => `  - ${c}`).join("\n") +
            `\nPass one explicitly via --entry.`,
        );
        process.exit(1);
      }
    } else if (interactive) {
      const suggestedEntry = entryCandidates[0];
      entryPath = orExit(
        await text({
          message: `Entry point for ${ormName}:`,
          initialValue: suggestedEntry,
          placeholder: suggestedEntry ?? "./path/to/schema",
          validate: (value) => (value ? undefined : "Entry path is required."),
        }),
      );
    } else if (entryCandidates.length === 1) {
      entryPath = entryCandidates[0];
    } else {
      console.error(
        `No entry point found for ${ormName}. Provide one via --entry.`,
      );
      process.exit(1);
    }
  }

  if (!entryPath) {
    process.exit(1);
  }

  let formats: OutputFormat[];
  if (opts.format) {
    formats = (opts.format as string)
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean) as OutputFormat[];
  } else if (interactive) {
    const available = Object.keys(emitters) as OutputFormat[];
    formats = orExit(
      await multiselect({
        message: "Output format(s):",
        options: available.map((f) => ({ value: f, label: f })),
        initialValues: available.includes("mermaid") ? ["mermaid"] : [],
        required: true,
      }),
    );
  } else {
    formats = ["mermaid"];
  }
  const selectedEmitters = formats.map(getEmitter);

  const outExample = `erd.${selectedEmitters[0].fileExtension}`;

  let outBase: string;
  if (opts.out) {
    outBase = opts.out;
  } else if (interactive) {
    outBase = orExit(
      await text({
        message: "Output path:",
        initialValue: outExample,
        defaultValue: outExample,
      }),
    );
  } else {
    outBase = "erd";
  }

  const s = interactive ? spinner() : undefined;
  s?.start("Generating...");

  const entry = await adapter.resolveEntry(entryPath, cwd);
  const model = await adapter.extract(entry);

  const written: string[] = [];
  for (const emitter of selectedEmitters) {
    const outPath = resolveOutPath(
      outBase,
      emitter.fileExtension,
      selectedEmitters.length,
    );
    await writeFile(outPath, emitter.emit(model), "utf-8");
    written.push(outPath);
  }

  const summary = `Written to ${written.join(", ")}`;
  if (interactive) {
    s?.stop(summary);
    outro("Done");
  } else {
    console.log(`✔ ${summary}`);
  }
}

main();
