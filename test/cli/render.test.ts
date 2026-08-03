import { describe, it, expect, vi, afterEach } from "vitest";
import { unicode } from "@clack/prompts";
import { icon, orExit, renderDiff } from "../../src/cli/render";
import type { DiffRow } from "../../src/core/check";

// @clack/core's CANCEL_SYMBOL isn't exported, so there's no real cancelled
// value to construct from outside the library. Swap isCancel for a
// sentinel-based check (keeping every other export, notably `unicode`,
// real) so orExit's cancel branch can be driven without a live prompt.
const CANCEL_SENTINEL = "__TEST_CANCEL__";
vi.mock("@clack/prompts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@clack/prompts")>();
  return {
    ...actual,
    isCancel: (value: unknown) => value === CANCEL_SENTINEL,
    cancel: vi.fn<(message?: string) => void>(),
  };
});

// picocolors auto-disables ANSI codes outside a TTY (which vitest's runner
// isn't), but strip them anyway so these assertions hold either way.
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*m/g, "");
}

describe("icon", () => {
  it("appends a trailing space to whichever glyph is used", () => {
    expect(icon("✔", "o")).toBe(unicode ? "✔ " : "o ");
  });

  it("returns an empty string when there's no fallback and unicode isn't supported", () => {
    expect(icon("📊")).toBe(unicode ? "📊 " : "");
  });
});

describe("orExit", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes non-cancelled values through unchanged", () => {
    expect(orExit("value")).toBe("value");
    expect(orExit(42)).toBe(42);
  });

  it("prints a cancellation notice and exits 0 for a cancelled value", () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    }) as unknown as { mockRestore(): void };

    expect(() => orExit(CANCEL_SENTINEL)).toThrow("process.exit(0)");
    expect(exit).toHaveBeenCalledWith(0);
  });
});

describe("renderDiff", () => {
  it("renders the on-disk/regenerated header for the given path", () => {
    const output = stripAnsi(renderDiff("erd.md", []));
    expect(output).toContain("--- erd.md (on disk)");
    expect(output).toContain("+++ erd.md (regenerated)");
  });

  it("renders an add row with a + prefix", () => {
    const rows: DiffRow[] = [{ kind: "add", line: "datetime deletedAt" }];
    expect(stripAnsi(renderDiff("erd.md", rows))).toContain(
      "+ datetime deletedAt",
    );
  });

  it("renders a remove row with a - prefix", () => {
    const rows: DiffRow[] = [{ kind: "remove", line: "string ghostField" }];
    expect(stripAnsi(renderDiff("erd.md", rows))).toContain(
      "- string ghostField",
    );
  });

  it("renders a change row as a before/after pair carrying the full text", () => {
    const rows: DiffRow[] = [
      { kind: "change", before: "Int x", after: "int x" },
    ];
    const output = stripAnsi(renderDiff("erd.md", rows));
    expect(output).toContain("- Int x");
    expect(output).toContain("+ int x");
  });
});
