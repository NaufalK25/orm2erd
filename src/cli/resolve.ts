import pc from "picocolors";
import { log, select, text } from "@clack/prompts";
import { adapters } from "../adapters";
import type { DetectedORM } from "../detect";
import { emitters, type Emitter } from "../emitters";
import { gridMultiselect } from "../core/grid-multiselect";
import type {
  CaseMode,
  InflectMode,
  NameMode,
  OutputFormat,
  RelationLabelMode,
  TypeMode,
} from "../core/format";
import type { ORMName } from "../core/orm";
import { icon, orExit } from "./render";

export const ALL_ORM_NAMES = Object.keys(adapters) as ORMName[];

// --check has no memory of what --out was used on the run that created the
// committed file, so there's no safe default to guess (e.g. "erd") — make
// --out mandatory whenever --check is passed, rather than silently checking
// the wrong path. Non-interactively (CI, -y, no TTY) this is a hard error:
// there's no one to ask, and it's checked before any prompting starts so a
// run doesn't walk through ORM/entry selection only to reject it at the very
// end for a flag that was missing from the start. Interactively, resolving
// --out is deferred to resolveOutBase's own check-aware prompt instead (see
// its `check` param) — that prompt has no pre-fillable default to guess at
// and requires explicit typed input, so it doesn't reintroduce the risky
// silent-guess this guard exists to rule out.
export function validateCheckRequiresOut(
  check: boolean,
  out: string | undefined,
  interactive: boolean,
): void {
  if (check && !out && !interactive) {
    console.error(
      pc.red(
        `${icon("✖", "x")}--check requires --out <path> so it knows which committed file to verify against.`,
      ),
    );
    process.exit(1);
  }
}

// --summary is a presentation mode for the diff --check already computes —
// there's nothing to summarize on a plain write run.
export function validateSummaryRequiresCheck(
  check: boolean,
  summary: boolean,
): void {
  if (summary && !check) {
    console.error(
      pc.red(
        `${icon("✖", "x")}--summary requires --check — it's a presentation mode for the diff --check computes.`,
      ),
    );
    process.exit(1);
  }
}

export async function resolveORM(
  detected: DetectedORM[],
  interactive: boolean,
  ormOpt: ORMName | undefined,
): Promise<{ ormName: ORMName; entryCandidates: string[] }> {
  let ormName: ORMName | undefined = ormOpt;
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
            `${icon("✖", "x")}No supported ORM detected. Pass --orm <name> to specify one.`,
          ),
        );
        process.exit(1);
      }
      ormName = orExit(
        await select({
          message: `${icon("🔍")}No supported ORM detected. Which one are you using?`,
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

export async function resolveEntryPath(
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
          message: `${icon("📁")}Multiple possible entry points found for ${ormName} — which one?`,
          options: entryCandidates.map((c) => ({ value: c, label: c })),
        }),
      );
    }
    console.error(
      pc.red(
        `${icon("✖", "x")}Multiple possible entry points found for ${ormName}:\n` +
          entryCandidates.map((c) => `  - ${c}`).join("\n") +
          `\nPass --entry <path> to specify one.`,
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
      `${icon("✖", "x")}No entry point found for ${ormName}. Pass --entry <path> to specify one.`,
    ),
  );
  process.exit(1);
}

export async function resolveFormats(
  interactive: boolean,
  formatOpt: string | undefined,
): Promise<OutputFormat[]> {
  if (formatOpt?.trim().toLowerCase() === "all") {
    return Object.keys(emitters) as OutputFormat[];
  }

  if (formatOpt) {
    return formatOpt
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean) as OutputFormat[];
  }

  if (interactive) {
    const available = Object.keys(emitters) as OutputFormat[];
    return orExit(
      await gridMultiselect({
        message: `${icon("🎨")}Output format(s):`,
        options: available.map((f) => ({ value: f, label: f })),
        initialValues: available.includes("mermaid") ? ["mermaid"] : [],
        required: true,
      }),
    );
  }

  return ["mermaid"];
}

export async function resolveTypeMode(
  interactive: boolean,
  typeModeOpt: TypeMode | undefined,
): Promise<TypeMode> {
  if (typeModeOpt) {
    return typeModeOpt;
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

export async function resolveNameMode(
  interactive: boolean,
  nameModeOpt: NameMode | undefined,
): Promise<NameMode> {
  if (nameModeOpt) {
    return nameModeOpt;
  }
  if (interactive) {
    return orExit(
      await select({
        message: `${icon("🏷️ ")}Entity/field names:`,
        options: [
          {
            value: "table",
            label: "Table",
            hint: "physical table/column names",
          },
          { value: "model", label: "Model", hint: "ORM model/field names" },
          { value: "both", label: "Both", hint: "physical name + ORM alias" },
        ],
        initialValue: "table",
      }),
    );
  }
  return "table";
}

export async function resolveRelationLabelMode(
  interactive: boolean,
  relationLabelModeOpt: RelationLabelMode | undefined,
): Promise<RelationLabelMode> {
  if (relationLabelModeOpt) {
    return relationLabelModeOpt;
  }
  if (interactive) {
    return orExit(
      await select({
        message: `${icon("🏷️ ")}Relation edge labels:`,
        options: [
          {
            value: "both",
            label: "Both",
            hint: "association alias, plus the FK column when it disambiguates",
          },
          { value: "alias", label: "Alias", hint: "association alias only" },
          { value: "column", label: "Column", hint: "FK column name only" },
        ],
        initialValue: "both",
      }),
    );
  }
  return "both";
}

export async function resolveCaseMode(
  interactive: boolean,
  caseModeOpt: CaseMode | undefined,
): Promise<CaseMode> {
  if (caseModeOpt) {
    return caseModeOpt;
  }
  if (interactive) {
    return orExit(
      await select({
        message: `${icon("🏷️ ")}Identifier casing:`,
        options: [
          {
            value: "preserve",
            label: "Preserve",
            hint: "keep the source ORM/DB casing as-is",
          },
          { value: "snake", label: "snake_case" },
          { value: "screaming_snake", label: "SCREAMING_SNAKE" },
          { value: "camel", label: "camelCase" },
          { value: "pascal", label: "PascalCase" },
          { value: "kebab", label: "kebab-case" },
          { value: "title", label: "Title Case" },
          { value: "lower", label: "lowercase" },
          { value: "upper", label: "UPPERCASE" },
        ],
        initialValue: "preserve",
      }),
    );
  }
  return "preserve";
}

export async function resolveInflectMode(
  interactive: boolean,
  inflectModeOpt: InflectMode | undefined,
): Promise<InflectMode> {
  if (inflectModeOpt) {
    return inflectModeOpt;
  }
  if (interactive) {
    return orExit(
      await select({
        message: `${icon("🏷️ ")}Entity name pluralization:`,
        options: [
          {
            value: "preserve",
            label: "Preserve",
            hint: "keep the source ORM/DB number as-is",
          },
          { value: "plural", label: "Plural", hint: "e.g. User -> Users" },
          {
            value: "singular",
            label: "Singular",
            hint: "e.g. Users -> User",
          },
        ],
        initialValue: "preserve",
      }),
    );
  }
  return "preserve";
}

export async function resolveOutBase(
  interactive: boolean,
  outExample: string,
  selectedEmitters: Emitter[],
  check = false,
): Promise<string> {
  if (interactive) {
    // --check has no committed file to fall back to, so unlike a plain
    // write's prompt (which pre-fills a guessed path that Enter alone
    // accepts), this one has no initialValue/defaultValue at all — an empty
    // submit fails validation and re-prompts, so the path always comes from
    // deliberate input, never a blindly-accepted guess.
    if (check) {
      return orExit(
        await text({
          message: `${icon("💾")}Which committed file should --check verify against?`,
          placeholder: outExample,
          validate: (value) =>
            value
              ? undefined
              : "A path is required for --check — there's no safe default to guess.",
        }),
      );
    }

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
