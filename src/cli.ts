import { Command, Option } from "commander";
import pc from "picocolors";
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
  unicode,
} from "@clack/prompts";
import { DetectedORM, detectORMs } from "./detect";
import { adapters, getAdapter, ORMAdapter } from "./adapters";
import { Emitter, emitters, getEmitter } from "./emitters";
import { withSuppressedOutput } from "./core/suppress-output";
import { withGuardedExit } from "./core/guard-exit";
import type { OutputFormat, TypeMode } from "./core/format";
import type { ORMName } from "./core/orm";
import type { PackageJson } from "./core/package";
import {
  checkOutput,
  diffWords,
  type DiffRow,
  type DiffSegment,
} from "./core/check";

const ALL_ORM_NAMES = Object.keys(adapters) as ORMName[];

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as PackageJson;

interface ProgramOptions {
  orm: ORMName;
  entry: string;
  format: string;
  out: string;
  typeMode: TypeMode;
  check: boolean;
  verbose: boolean;
}

const program = new Command();

program
  .name("orm2erd")
  .description(
    "Generate an ERD from your ORM's models/schema — no manual diagramming.",
  )
  .version(version, "-v, --version", "output the current version")
  .option("--orm <name>", `ORM to use (${ALL_ORM_NAMES.join(", ")})`)
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
    "--check",
    "verify committed ERD file(s) are up to date; exit non-zero on drift or if missing (writes nothing)",
  )
  .option(
    "--verbose",
    "show log output from the target codebase during extraction (suppressed by default)",
  )
  .addHelpText(
    "after",
    `
${pc.bold("Examples:")}
  $ orm2erd
  $ orm2erd --orm prisma --entry ./prisma/schema.prisma --format mermaid,dbml --out ./erd
  $ orm2erd --orm prisma --entry ./prisma/schema.prisma --format mermaid --type-mode native`,
  )
  .configureHelp({
    styleTitle: (str) => pc.bold(pc.underline(str)),
    styleCommandText: (str) => pc.cyan(str),
    styleCommandDescription: (str) => pc.dim(str),
    styleDescriptionText: (str) => pc.white(str),
    styleOptionText: (str) => pc.green(str),
    styleArgumentText: (str) => pc.yellow(str),
    styleSubcommandText: (str) => pc.cyan(str),
  })
  .parse();

const opts = program.opts<ProgramOptions>();

// Emoji only render where the terminal's locale/environment signals support
// for it (same heuristic @clack/prompts uses for its own box-drawing
// characters); everywhere else falls back to plain ASCII, or nothing for
// purely decorative icons.
function icon(symbol: string, fallback = ""): string {
  if (unicode) return `${symbol} `;
  return fallback ? `${fallback} ` : "";
}

// Renders one side of a "change" row: the prefix and changed words in yellow
// (bold), unchanged words dimmed so the eye lands on what actually changed.
function renderChangedSide(prefix: string, segments: DiffSegment[]): string {
  const body = segments
    .map((seg) =>
      seg.changed ? pc.bold(pc.yellow(seg.text)) : pc.dim(seg.text),
    )
    .join("");
  return pc.yellow(prefix) + body;
}

// Renders classified diff rows for the terminal: additions green, removals red,
// and edits ("change") as a yellow before/after pair with only the changed
// words highlighted. The ---/+++ headers are dimmed. picocolors auto-disables
// when output isn't a TTY (e.g. a CI log), so this degrades to plain text there.
function renderDiff(path: string, rows: DiffRow[]): string {
  const out = [
    pc.dim(`--- ${path} (on disk)`),
    pc.dim(`+++ ${path} (regenerated)`),
  ];

  for (const row of rows) {
    if (row.kind === "add") {
      out.push(pc.green(`+ ${row.line}`));
    } else if (row.kind === "remove") {
      out.push(pc.red(`- ${row.line}`));
    } else {
      const { removed, added } = diffWords(row.before, row.after);
      out.push(renderChangedSide("- ", removed));
      out.push(renderChangedSide("+ ", added));
    }
  }

  return out.join("\n");
}

// Unwraps a clack prompt result, exiting cleanly on Ctrl+C instead of
// letting the cancel symbol leak into the rest of the pipeline.
function orExit<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel(pc.red(`${icon("🚫", "x")}Cancelled.`));
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
        log.step(`${icon("🔍")}Detected: ${ormName}`);
      }
    } else if (detected.length > 1) {
      if (!interactive) {
        console.error(
          pc.red(
            `${icon("✖", "x")}Multiple ORMs detected (${detected.map((d) => d.name).join(", ")}). Pass --orm <name> to specify one.`,
          ),
        );
        process.exit(1);
      }
      ormName = orExit(
        await select({
          message: `${icon("🔍")}Multiple ORMs detected — which one?`,
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
          pc.red(
            `${icon("✖", "x")}No supported ORM detected. Pass --orm <name> to specify one manually.`,
          ),
        );
        process.exit(1);
      }
      ormName = orExit(
        await select({
          message: `${icon("🔍")}No ORM detected. Which one are you using?`,
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
          message: `${icon("📁")}Multiple schema locations found for ${ormName} — which one?`,
          options: entryCandidates.map((c) => ({ value: c, label: c })),
        }),
      );
    }
    console.error(
      pc.red(
        `${icon("✖", "x")}Multiple possible entry points found for ${ormName}:\n` +
          entryCandidates.map((c) => `  - ${c}`).join("\n") +
          `\nPass one explicitly via --entry.`,
      ),
    );
    process.exit(1);
  }

  if (interactive) {
    const suggestedEntry = entryCandidates[0];
    return orExit(
      await text({
        message: `${icon("📄")}Entry point for ${ormName}:`,
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
    pc.red(
      `${icon("✖", "x")}No entry point found for ${ormName}. Provide one via --entry.`,
    ),
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
  // one this run will actually produce (e.g. base "erd.mmd" while also
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
        message: `${icon("🎨")}Output format(s):`,
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
        message: `${icon("🏷️ ")}Type labels:`,
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
        message: `${icon("💾")}Output path:${preview}`,
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
  check: boolean,
  verbose: boolean,
  interactive: boolean,
): Promise<void> {
  const s = interactive ? spinner() : undefined;
  s?.start(`${icon("⚙️")}Generating...`);

  try {
    const entry = await adapter.resolveEntry(entryPath, cwd);
    const model = await withGuardedExit(() =>
      verbose
        ? adapter.extract(entry)
        : withSuppressedOutput(() => adapter.extract(entry)),
    );

    const allExtensions = selectedEmitters.map((e) => e.fileExtension);
    const outputs = selectedEmitters.map((emitter) => ({
      path: resolveOutPath(outBase, emitter.fileExtension, allExtensions),
      content: emitter.emit(model, { typeMode }),
    }));

    if (check) {
      const results = await Promise.all(
        outputs.map((o) => checkOutput(o.path, o.content)),
      );
      const failed = results.filter((r) => r.status !== "ok");

      if (failed.length === 0) {
        console.log(
          pc.green(
            `${icon("✔", "o")}ERD up to date (${results.map((r) => r.path).join(", ")})`,
          ),
        );
        process.exit(0);
      }

      for (const r of failed) {
        if (r.status === "missing") {
          console.error(
            pc.red(
              `${icon("✖", "x")}${r.path} does not exist — run without --check to create it`,
            ),
          );
        } else {
          console.error(
            pc.yellow(`${icon("≠", "~")}${r.path} is out of date:`),
          );
          console.error(renderDiff(r.path, r.rows ?? []));
        }
      }
      console.error(pc.dim("\nRun orm2erd without --check to regenerate."));
      process.exit(1);
    }

    const outDir = dirname(outBase);
    if (outDir !== ".") {
      await mkdir(outDir, { recursive: true });
    }

    const written: string[] = [];
    for (const { path, content } of outputs) {
      await writeFile(path, content, "utf-8");
      written.push(path);
    }

    const summary = `Written to ${written.join(", ")}`;
    if (interactive) {
      s?.stop(pc.green(`${icon("✔", "o")}${summary}`));
      outro(pc.green(`${icon("✔", "o")}Done`));
    } else {
      console.log(pc.green(`${icon("✔", "o")}${summary}`));
    }

    // Importing the target codebase can leave open handles (DB connection,
    // timers) that would otherwise hold the event loop open forever.
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (interactive) {
      s?.error(message);
      outro(pc.red(`${icon("✖", "x")}Failed`));
    } else {
      console.error(pc.red(`${icon("✖", "x")}${message}`));
    }
    process.exit(1);
  }
}

async function main() {
  const cwd = process.cwd();
  // isCI() is also checked because some CI runners still report a TTY.
  // --check must never prompt (it runs in CI); force non-interactive so it
  // relies on flags / detection only.
  const interactive = isTTY(process.stdout) && !isCI() && !opts.check;

  if (interactive) intro(`${icon("📊")}${pc.bold("orm2erd")}`);

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
    opts.out ??
    (await resolveOutBase(interactive, outExample, selectedEmitters));
  const typeMode = await resolveTypeMode(interactive);

  await generateAndWrite(
    cwd,
    adapter,
    entryPath,
    selectedEmitters,
    outBase,
    typeMode,
    opts.check,
    opts.verbose,
    interactive,
  );
}

main();
