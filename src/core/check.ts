import { readFile } from "node:fs/promises";

export type CheckStatus = "ok" | "drift" | "missing";

// One line of a diff. A "change" is a line present in both versions but edited
// (kept as a before/after pair); "add"/"remove" are lines that exist on only
// one side.
export type DiffRow =
  | { kind: "add"; line: string }
  | { kind: "remove"; line: string }
  | { kind: "change"; before: string; after: string };

export interface CheckResult {
  path: string;
  status: CheckStatus;
  rows?: DiffRow[];
}

// Normalize line endings + trailing newline so cross-platform checkouts
// don't report false drift. Deliberately does NOT touch interior whitespace —
// real content drift must still surface.
export function normalize(content: string): string {
  return content.replace(/\r\n/g, "\n").replace(/\n+$/, "");
}

type DiffOpType = "common" | "removed" | "added";

interface DiffOp {
  type: DiffOpType;
  value: string;
}

// Longest-common-subsequence diff over two token sequences. Items in the LCS
// are "common"; the rest are "removed" (only in `a`) or "added" (only in `b`).
// Used for both line-level (a token = a line) and word-level (a token = a word)
// diffs, so an inserted line no longer offsets everything after it.
function lcsDiff(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;

  // dp[i][j] = LCS length of a[i..] and b[j..].
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array.from({ length: m + 1 }, () => 0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "common", value: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "removed", value: a[i++] });
    } else {
      ops.push({ type: "added", value: b[j++] });
    }
  }
  while (i < n) ops.push({ type: "removed", value: a[i++] });
  while (j < m) ops.push({ type: "added", value: b[j++] });

  return ops;
}

// A removed and an added line are treated as one "change" (edit of the same
// line) rather than a separate remove + add only when they share at least this
// fraction of their non-whitespace words. Below it, they're unrelated lines
// that happened to land next to each other.
const CHANGE_SIMILARITY_THRESHOLD = 0.5;

// Fraction of shared words between two lines (whitespace-only tokens ignored),
// via their LCS. 1 = identical word sequence, 0 = nothing in common.
function similarity(a: string, b: string): number {
  const wordsA = tokenize(a).filter((t) => t.trim() !== "");
  const wordsB = tokenize(b).filter((t) => t.trim() !== "");
  const max = Math.max(wordsA.length, wordsB.length);
  if (max === 0) return 1;
  const common = lcsDiff(wordsA, wordsB).filter(
    (op) => op.type === "common",
  ).length;
  return common / max;
}

// Classifies one contiguous change region (the removed and added lines between
// two common lines) into change/remove/add rows. Each removed line is matched
// to its most similar unused added line; a match above the threshold becomes a
// "change", the rest are standalone removes/adds. Changes and removes are
// emitted in on-disk order, then any leftover additions.
function classifyRegion(removed: string[], added: string[]): DiffRow[] {
  const rows: DiffRow[] = [];
  const usedAdded = Array.from<boolean>({ length: added.length }).fill(false);

  for (const before of removed) {
    let bestIndex = -1;
    let bestScore = CHANGE_SIMILARITY_THRESHOLD;
    for (let j = 0; j < added.length; j++) {
      if (usedAdded[j]) continue;
      const score = similarity(before, added[j]);
      if (score >= bestScore) {
        bestScore = score;
        bestIndex = j;
      }
    }
    if (bestIndex >= 0) {
      usedAdded[bestIndex] = true;
      rows.push({ kind: "change", before, after: added[bestIndex] });
    } else {
      rows.push({ kind: "remove", line: before });
    }
  }

  for (let j = 0; j < added.length; j++) {
    if (!usedAdded[j]) rows.push({ kind: "add", line: added[j] });
  }

  return rows;
}

// Line-level LCS diff, classified into add/remove/change rows. Common lines
// anchor the diff so an inserted or deleted line no longer shifts everything
// after it into a false mismatch, and they're omitted to keep the output
// focused on what actually changed.
export function diffRows(actual: string, expected: string): DiffRow[] {
  const ops = lcsDiff(
    normalize(actual).split("\n"),
    normalize(expected).split("\n"),
  );
  const rows: DiffRow[] = [];

  for (let k = 0; k < ops.length;) {
    if (ops[k].type === "common") {
      k++;
      continue;
    }
    const removed: string[] = [];
    const added: string[] = [];
    while (k < ops.length && ops[k].type !== "common") {
      if (ops[k].type === "removed") removed.push(ops[k].value);
      else added.push(ops[k].value);
      k++;
    }
    rows.push(...classifyRegion(removed, added));
  }

  return rows;
}

export interface DiffSegment {
  text: string;
  changed: boolean;
}

export interface WordDiff {
  // Segments for the "-" (on-disk) line and the "+" (regenerated) line. Each
  // reconstructs its original line exactly when the segment texts are joined.
  removed: DiffSegment[];
  added: DiffSegment[];
}

// Split into an alternating sequence of whitespace runs and non-whitespace
// runs, so joining the tokens reproduces the input and highlighting lands on
// whole words rather than mid-token.
function tokenize(line: string): string[] {
  return line.match(/\s+|\S+/g) ?? [];
}

// Token-level (word) diff between two lines. Tokens present in both are marked
// unchanged; the rest are marked changed so a renderer can highlight only what
// actually differs.
export function diffWords(before: string, after: string): WordDiff {
  const removed: DiffSegment[] = [];
  const added: DiffSegment[] = [];

  for (const op of lcsDiff(tokenize(before), tokenize(after))) {
    if (op.type === "common") {
      removed.push({ text: op.value, changed: false });
      added.push({ text: op.value, changed: false });
    } else if (op.type === "removed") {
      removed.push({ text: op.value, changed: true });
    } else {
      added.push({ text: op.value, changed: true });
    }
  }

  return { removed, added };
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
  return { path, status: "drift", rows: diffRows(actual, expected) };
}
