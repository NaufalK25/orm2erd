import pc from "picocolors";
import { log, select, text } from "@clack/prompts";
import { adapters } from "../adapters";
import type { DetectedORM } from "../detect";
import { emitters, type Emitter } from "../emitters";
import { gridMultiselect } from "../core/grid-multiselect";
import type {
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
// the wrong path.
export function validateCheckRequiresOut(
  check: boolean,
  out: string | undefined,
): void {
  if (check && !out) {
    console.error(
      pc.red(
        `${icon("✖", "x")}--check requires --out <path> so it knows which committed file to verify against.`,
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

export async function resolveOutBase(
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
