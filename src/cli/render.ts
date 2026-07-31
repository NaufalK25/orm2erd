import pc from "picocolors";
import { cancel, isCancel, unicode } from "@clack/prompts";
import { diffWords, type DiffRow, type DiffSegment } from "../core/check";

// Emoji only render where the terminal's locale/environment signals support
// for it (same heuristic @clack/prompts uses for its own box-drawing
// characters); everywhere else falls back to plain ASCII, or nothing for
// purely decorative icons.
export function icon(symbol: string, fallback = ""): string {
  if (unicode) return `${symbol} `;
  return fallback ? `${fallback} ` : "";
}

// Unwraps a clack prompt result, exiting cleanly on Ctrl+C instead of
// letting the cancel symbol leak into the rest of the pipeline.
export function orExit<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel(pc.red(`${icon("🚫", "x")}Cancelled.`));
    process.exit(0);
  }
  return value;
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
export function renderDiff(path: string, rows: DiffRow[]): string {
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
