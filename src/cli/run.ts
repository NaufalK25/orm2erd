import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Writable } from "node:stream";
import clipboardy from "clipboardy";
import pc from "picocolors";
import { outro, spinner } from "@clack/prompts";
import type { ORMAdapter } from "../adapters";
import { checkOutput } from "../core/check";
import type {
  CaseMode,
  InflectMode,
  NameMode,
  OutputFormat,
  RelationLabelMode,
  TypeMode,
} from "../core/format";
import { withGuardedExit } from "../core/guard-exit";
import { friendlyImportHint } from "../core/import-hints";
import { resolveOutPath } from "../core/out-path";
import { withSuppressedOutput } from "../core/suppress-output";
import type { Emitter } from "../emitters";
import { icon, renderDiff } from "./render";

interface Output {
  path: string;
  content: string;
}

interface PhaseReporter {
  next(label: string): Promise<void>;
  succeed(summary: string): void;
  fail(err: unknown): void;
  realStdoutWrite: (chunk: string) => void;
  statusLog: (message: string) => void;
}

// Wraps the spinner (interactive) / plain log lines (non-interactive) used
// to narrate each pipeline phase, plus the terminal outputs for --stdout and
// the final success/failure lines — all of it shares the same "are we
// interactive" branching, so it lives behind one small interface.
function createPhaseReporter(
  interactive: boolean,
  stdout: boolean,
): PhaseReporter {
  // withSuppressedOutput patches process.stdout.write to a no-op during
  // extract(), which would also swallow the spinner's own renders. Capture
  // the real write fn before that patch exists so the spinner (and
  // --stdout's own output) can bypass it.
  const realStdoutWrite = process.stdout.write.bind(process.stdout);
  const spinnerOutput = {
    write: realStdoutWrite,
    get columns() {
      return process.stdout.columns;
    },
  } as unknown as Writable;

  // No indicator: "timer" — its digits can't tick during the synchronous
  // block a phase can wrap and freeze on a number, which reads as broken; a
  // static glyph doesn't carry that expectation.
  const s = interactive ? spinner({ output: spinnerOutput }) : undefined;
  let started = false;
  // --stdout writes the diagram itself to stdout, so status/log lines are
  // routed to stderr instead — keeps `orm2erd --stdout | some-tool` clean.
  const statusLog = stdout ? console.error : console.log;

  return {
    realStdoutWrite,
    statusLog,
    async next(label) {
      const line = `${icon("⚙️ ")}${label}`;
      if (interactive) {
        if (!started) {
          s?.start(line);
          started = true;
        } else {
          s?.message(line);
        }
        // The spinner only paints from its own ~80-120ms interval. Some phases
        // (e.g. importing the target's models) are one long synchronous block
        // that starves that interval entirely, so without yielding here first,
        // the label would never render before the block already finished.
        await new Promise((resolve) => setTimeout(resolve, 150));
      } else {
        statusLog(line);
      }
    },
    succeed(summary) {
      if (interactive) {
        s?.stop(pc.green(`${icon("✔", "o")}${summary}`));
        outro(pc.green(`${icon("✔", "o")}Done`));
      } else {
        statusLog(pc.green(`${icon("✔", "o")}${summary}`));
      }
    },
    fail(err) {
      const message = err instanceof Error ? err.message : String(err);
      const hint = friendlyImportHint(err);
      if (interactive) {
        const fullMessage = hint ? `${message}\n${pc.dim(hint)}` : message;
        s?.error(fullMessage);
        outro(pc.red(`${icon("✖", "x")}Failed`));
      } else {
        console.error(pc.red(`${icon("✖", "x")}${message}`));
        if (hint) console.error(pc.dim(hint));
      }
    },
  };
}

async function runCheck(outputs: Output[]): Promise<never> {
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
      console.error(pc.yellow(`${icon("≠", "~")}${r.path} is out of date:`));
      console.error(renderDiff(r.path, r.rows ?? []));
    }
  }
  console.error(pc.dim("\nRun orm2erd without --check to regenerate."));
  process.exit(1);
}

function writeStdout(
  phase: PhaseReporter,
  output: Output,
  format: OutputFormat,
) {
  const content = output.content;
  phase.realStdoutWrite(content.endsWith("\n") ? content : `${content}\n`);
  phase.statusLog(
    pc.dim(`${icon("✔", "o")}Printed ${format} diagram to stdout`),
  );
}

async function writeClipboard(
  phase: PhaseReporter,
  output: Output,
  format: OutputFormat,
) {
  await clipboardy.write(output.content);
  phase.succeed(`Copied ${format} diagram to clipboard`);
}

async function writeFiles(
  phase: PhaseReporter,
  outBase: string,
  outputs: Output[],
) {
  const outDir = dirname(outBase);
  if (outDir !== ".") {
    await mkdir(outDir, { recursive: true });
  }

  const written: string[] = [];
  for (const { path, content } of outputs) {
    await writeFile(path, content, "utf-8");
    written.push(path);
  }

  phase.succeed(`Written to ${written.join(", ")}`);
}

export async function generateAndWrite(
  cwd: string,
  adapter: ORMAdapter,
  entryPath: string,
  selectedEmitters: Emitter[],
  outBase: string,
  typeMode: TypeMode,
  nameMode: NameMode,
  relationLabelMode: RelationLabelMode,
  caseMode: CaseMode,
  inflectMode: InflectMode,
  check: boolean,
  stdoutFlag: boolean,
  copy: boolean,
  verbose: boolean,
  interactive: boolean,
): Promise<void> {
  const phase = createPhaseReporter(interactive, stdoutFlag);

  try {
    await phase.next("Resolving entry…");
    const entry = await adapter.resolveEntry(entryPath, cwd);

    await phase.next("Parsing schema…");
    const model = await withGuardedExit(() =>
      verbose
        ? adapter.extract(entry)
        : withSuppressedOutput(() => adapter.extract(entry)),
    );

    await phase.next("Generating diagram(s)…");
    const allExtensions = selectedEmitters.map((e) => e.fileExtension);
    const outputs: Output[] = selectedEmitters.map((emitter) => ({
      path: resolveOutPath(outBase, emitter.fileExtension, allExtensions),
      content: emitter.emit(model, {
        typeMode,
        nameMode,
        relationLabelMode,
        caseMode,
        inflectMode,
      }),
    }));

    if (check) {
      await runCheck(outputs);
      return;
    }

    if (stdoutFlag) {
      writeStdout(phase, outputs[0], selectedEmitters[0].format);
    }

    if (copy) {
      await phase.next("Copying to clipboard…");
      await writeClipboard(phase, outputs[0], selectedEmitters[0].format);
    }

    if (stdoutFlag || copy) {
      process.exit(0);
    }

    await phase.next("Writing output…");
    await writeFiles(phase, outBase, outputs);

    // Importing the target codebase can leave open handles (DB connection,
    // timers) that would otherwise hold the event loop open forever.
    process.exit(0);
  } catch (err) {
    phase.fail(err);
    process.exit(1);
  }
}
