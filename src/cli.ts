import { Command, Option } from "commander";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname } from "node:path";
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
import { DetectedORM, detectORMs } from "./detect";
import { adapters, getAdapter, ORMAdapter } from "./adapters";
import { Emitter, emitters, getEmitter } from "./emitters";
import { withSuppressedOutput } from "./core/suppress-output";
import type { OutputFormat, TypeMode } from "./core/format";
import type { ORMName } from "./core/orm";
import type { PackageJson } from "./core/package";

const ALL_ORM_NAMES = Object.keys(adapters) as ORMName[];

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as PackageJson;

interface ProgramOptions {
  orm: ORMName;
  entry: string;
  format: string;
  out: string;
  typeMode: TypeMode;
  verbose: boolean;
}

const program = new Command();

program
  .name("orm2erd")
  .description(
    "Generate an ERD from your ORM's models/schema — no manual diagramming.",
  )
  .version(version, "-v, --version", "output the current version")
  .option("--orm <name>", "ORM to use (prisma, sequelize)")
  .option("--entry <path>", "path to the ORM's schema/model entry")
  .option("--format <formats>", "output format(s), comma-separated (mermaid)")
  .option(
    "--out <path>",
    "output path — a full filename (e.g. erd.md) is used as-is; a bare name (e.g. erd) gets the format's extension appended",
  )
  .addOption(
    new Option(
      "--type-mode <mode>",
      "type labels to emit: canonical (portable) or native (ORM-specific)",
    ).choices(["canonical", "native"]),
  )
  .option(
    "--verbose",
    "show log output from the target codebase during extraction (suppressed by default)",
  )
  .addHelpText(
    "after",
    `
Examples:
  $ orm2erd
  $ orm2erd --orm prisma --entry ./prisma/schema.prisma --format mermaid,dbml --out ./erd
  $ orm2erd --orm prisma --entry ./prisma/schema.prisma --format mermaid --type-mode native`,
  )
  .parse();

const opts = program.opts<ProgramOptions>();

// Unwraps a clack prompt result, exiting cleanly on Ctrl+C instead of
// letting the cancel symbol leak into the rest of the pipeline.
function orExit<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel("Cancelled.");
    process.exit(0);
  }
  return value;
}

async function resolveORM(
  detected: DetectedORM[],
  interactive: boolean,
): Promise<{ ormName: ORMName; entryCandidates: string[] }> {
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

  return { ormName, entryCandidates };
}

async function resolveEntryPath(
  ormName: ORMName,
  entryCandidates: string[],
  interactive: boolean,
): Promise<string> {
  if (entryCandidates.length > 1) {
    // Ambiguous: e.g. Prisma with both a single schema.prisma and a
    // multi-file prisma/schema/ directory present at once.
    if (interactive) {
      return orExit(
        await select({
          message: `Multiple schema locations found for ${ormName} — which one?`,
          options: entryCandidates.map((c) => ({ value: c, label: c })),
        }),
      );
    }
    console.error(
      `Multiple possible entry points found for ${ormName}:\n` +
        entryCandidates.map((c) => `  - ${c}`).join("\n") +
        `\nPass one explicitly via --entry.`,
    );
    process.exit(1);
  }

  if (interactive) {
    const suggestedEntry = entryCandidates[0];
    return orExit(
      await text({
        message: `Entry point for ${ormName}:`,
        initialValue: suggestedEntry,
        placeholder: suggestedEntry ?? "./path/to/schema",
        validate: (value) => (value ? undefined : "Entry path is required."),
      }),
    );
  }

  if (entryCandidates.length === 1) {
    return entryCandidates[0];
  }

  console.error(
    `No entry point found for ${ormName}. Provide one via --entry.`,
  );
  process.exit(1);
}

function resolveOutPath(
  base: string,
  extension: string,
  allExtensions: string[],
): string {
  const ext = extname(base).slice(1);

  // A single format with an explicit extension is used exactly as given
  // (e.g. --out erd.md).
  if (allExtensions.length === 1) {
    return ext ? base : `${base}.${extension}`;
  }

  // With multiple formats, only strip an existing extension if it matches
  // one this run will actually produce (e.g. base "erd.mermaid" while also
  // emitting dbml) — otherwise it's part of the intended name (e.g.
  // "file.erd") and each emitter's extension is appended after it.
  if (ext && allExtensions.includes(ext)) {
    return `${base.slice(0, -(ext.length + 1))}.${extension}`;
  }
  return `${base}.${extension}`;
}

async function resolveFormats(interactive: boolean): Promise<OutputFormat[]> {
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
  return formats;
}

async function resolveTypeMode(interactive: boolean): Promise<TypeMode> {
  if (opts.typeMode) {
    return opts.typeMode;
  }
  if (interactive) {
    return orExit(
      await select({
        message: "Type labels:",
        options: [
          {
            value: "canonical",
            label: "Canonical",
            hint: "portable across ORMs",
          },
          { value: "native", label: "Native", hint: "ORM-specific type names" },
        ],
        initialValue: "canonical",
      }),
    );
  }
  return "canonical";
}

async function resolveOutBase(
  interactive: boolean,
  outExample: string,
  selectedEmitters: Emitter[],
): Promise<string> {
  if (interactive) {
    const preview =
      selectedEmitters.length > 1
        ? ` (writes ${selectedEmitters
            .map((e) => `${outExample}.${e.fileExtension}`)
            .join(", ")})`
        : "";
    return orExit(
      await text({
        message: `Output path:${preview}`,
        initialValue: outExample,
        defaultValue: outExample,
      }),
    );
  }

  return "erd";
}

async function generateAndWrite(
  cwd: string,
  adapter: ORMAdapter,
  entryPath: string,
  selectedEmitters: Emitter[],
  outBase: string,
  typeMode: TypeMode,
  verbose: boolean,
  interactive: boolean,
): Promise<void> {
  const s = interactive ? spinner() : undefined;
  s?.start("Generating...");

  try {
    const entry = await adapter.resolveEntry(entryPath, cwd);
    const model = verbose
      ? await adapter.extract(entry)
      : await withSuppressedOutput(() => adapter.extract(entry));

    const outDir = dirname(outBase);
    if (outDir !== ".") {
      await mkdir(outDir, { recursive: true });
    }

    const allExtensions = selectedEmitters.map((e) => e.fileExtension);
    const written: string[] = [];
    for (const emitter of selectedEmitters) {
      const outPath = resolveOutPath(
        outBase,
        emitter.fileExtension,
        allExtensions,
      );
      await writeFile(outPath, emitter.emit(model, { typeMode }), "utf-8");
      written.push(outPath);
    }

    const summary = `Written to ${written.join(", ")}`;
    if (interactive) {
      s?.stop(summary);
      outro("Done");
    } else {
      console.log(`✔ ${summary}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (interactive) {
      s?.error(message);
      outro("Failed");
    } else {
      console.error(message);
    }
    process.exit(1);
  }
}

async function main() {
  const cwd = process.cwd();
  // isCI() is also checked because some CI runners still report a TTY.
  const interactive = isTTY(process.stdout) && !isCI();

  if (interactive) intro("orm2erd");

  // Both flags are required to skip detection, not just --orm: without
  // --entry, detection still needs to run to populate entryCandidates.
  const skipDetection = Boolean(opts.orm) && Boolean(opts.entry);
  const detected = skipDetection ? [] : await detectORMs(cwd);

  const { ormName, entryCandidates } = await resolveORM(detected, interactive);
  const adapter = getAdapter(ormName);
  const entryPath =
    opts.entry ??
    (await resolveEntryPath(ormName, entryCandidates, interactive));

  const formats = await resolveFormats(interactive);
  const selectedEmitters = formats.map(getEmitter);
  const outExample =
    selectedEmitters.length > 1
      ? "erd"
      : `erd.${selectedEmitters[0].fileExtension}`;
  const outBase =
    opts.out ?? (await resolveOutBase(interactive, outExample, selectedEmitters));
  const typeMode = await resolveTypeMode(interactive);

  await generateAndWrite(
    cwd,
    adapter,
    entryPath,
    selectedEmitters,
    outBase,
    typeMode,
    opts.verbose,
    interactive,
  );
}

main();
