import { readFile } from "node:fs/promises";

export type CheckStatus = "ok" | "drift" | "missing";

export interface CheckResult {
  path: string;
  status: CheckStatus;
  diff?: string;
}

// Normalize line endings + trailing newline so cross-platform checkouts
// don't report false drift. Deliberately does NOT touch interior whitespace —
// real content drift must still surface.
export function normalize(content: string): string {
  return content.replace(/\r\n/g, "\n").replace(/\n+$/, "");
}

// Naive positional line diff — good enough to show "what changed" for
// line-oriented emitter output. Not a minimal LCS diff; drifts visually after
// an insert, but honest about whether content changed. Upgrade later if needed.
export function diffLines(
  path: string,
  actual: string,
  expected: string,
): string {
  const a = normalize(actual).split("\n");
  const b = normalize(expected).split("\n");
  const out = [`--- ${path} (on disk)`, `+++ ${path} (regenerated)`];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (a[i] === b[i]) continue;
    if (a[i] !== undefined) out.push(`- ${a[i]}`);
    if (b[i] !== undefined) out.push(`+ ${b[i]}`);
  }
  return out.join("\n");
}

// Compare regenerated content against what's on disk. READ ONLY — never writes.
export async function checkOutput(
  path: string,
  expected: string,
): Promise<CheckResult> {
  let actual: string;
  try {
    actual = await readFile(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { path, status: "missing" };
    }
    throw err;
  }
  if (normalize(actual) === normalize(expected)) {
    return { path, status: "ok" };
  }
  return { path, status: "drift", diff: diffLines(path, actual, expected) };
}
