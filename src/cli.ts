import { Command, Option } from "commander";
import pc from "picocolors";
import { createRequire } from "node:module";
import { intro, isCI, isTTY } from "@clack/prompts";
import { detectORMs } from "./detect";
import { getAdapter } from "./adapters";
import { getEmitter } from "./emitters";
import type { NameMode, RelationLabelMode, TypeMode } from "./core/format";
import type { ORMName } from "./core/orm";
import type { PackageJson } from "./core/package";
import { expandOutDir } from "./core/out-path";
import { icon } from "./cli/render";
import {
  ALL_ORM_NAMES,
  resolveEntryPath,
  resolveFormats,
  resolveNameMode,
  resolveORM,
  resolveOutBase,
  resolveRelationLabelMode,
  resolveTypeMode,
} from "./cli/resolve";
import { generateAndWrite } from "./cli/run";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as PackageJson;

interface ProgramOptions {
  orm: ORMName;
  entry: string;
  format: string;
  out: string;
  typeMode: TypeMode;
  names: NameMode;
  relationLabel: RelationLabelMode;
  check: boolean;
  stdout: boolean;
  copy: boolean;
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
  .addOption(
    new Option(
      "--names <mode>",
      "entity/field identifiers to emit: table (physical, default), model (ORM names), or both",
    ).choices(["table", "model", "both"]),
  )
  .addOption(
    new Option(
      "--relation-label <mode>",
      "relation edge label: both (alias + disambiguating FK column, default), alias, or column",
    ).choices(["both", "alias", "column"]),
  )
  .option(
    "--check",
    "verify committed ERD file(s) are up to date; exit non-zero on drift or if missing (writes nothing)",
  )
  .option(
    "--stdout",
    "print the diagram to stdout instead of writing a file (single format only)",
  )
  .option(
    "--copy",
    "copy the diagram to the clipboard instead of writing a file (single format only)",
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
  $ orm2erd --orm prisma --entry ./prisma/schema.prisma --format mermaid --type-mode native
  $ orm2erd --orm prisma --entry ./prisma/schema.prisma --format mermaid --names both`,
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

async function main() {
  const cwd = process.cwd();
  // isCI() is also checked because some CI runners still report a TTY.
  // --check must never prompt (it runs in CI); force non-interactive so it
  // relies on flags / detection only. --stdout needs the same treatment so
  // status/prompt chrome never lands on the stream the diagram is printed to.
  const interactive =
    isTTY(process.stdout) && !isCI() && !opts.check && !opts.stdout;

  if (interactive) intro(`${icon("📊")}${pc.bold("orm2erd")}`);

  // Both flags are required to skip detection, not just --orm: without
  // --entry, detection still needs to run to populate entryCandidates.
  const skipDetection = Boolean(opts.orm) && Boolean(opts.entry);
  const detected = skipDetection ? [] : await detectORMs(cwd);

  const { ormName, entryCandidates } = await resolveORM(
    detected,
    interactive,
    opts.orm,
  );
  const adapter = getAdapter(ormName);
  const entryPath =
    opts.entry ??
    (await resolveEntryPath(ormName, entryCandidates, interactive));

  const formats = await resolveFormats(interactive, opts.format);
  const selectedEmitters = formats.map(getEmitter);

  const singleFormatFlags = [
    opts.stdout && "--stdout",
    opts.copy && "--copy",
  ].filter((flag): flag is string => Boolean(flag));
  if (singleFormatFlags.length > 0 && selectedEmitters.length > 1) {
    console.error(
      pc.red(
        `${icon("✖", "x")}Multiple --format values given with ${singleFormatFlags.join("/")}. Pass --format <format> to specify one.`,
      ),
    );
    process.exit(1);
  }

  const outExample =
    selectedEmitters.length > 1
      ? "erd"
      : `erd.${selectedEmitters[0].fileExtension}`;
  // --stdout/--copy never write a file, so the output-path prompt would ask
  // for something that's never used — skip it regardless of `interactive`.
  const outBase = await expandOutDir(
    opts.out ??
      (opts.stdout || opts.copy
        ? "erd"
        : await resolveOutBase(interactive, outExample, selectedEmitters)),
  );
  const typeMode = await resolveTypeMode(interactive, opts.typeMode);
  const nameMode = await resolveNameMode(interactive, opts.names);
  const relationLabelMode = await resolveRelationLabelMode(
    interactive,
    opts.relationLabel,
  );

  await generateAndWrite(
    cwd,
    adapter,
    entryPath,
    selectedEmitters,
    outBase,
    typeMode,
    nameMode,
    relationLabelMode,
    opts.check,
    opts.stdout,
    opts.copy,
    opts.verbose,
    interactive,
  );
}

main();
