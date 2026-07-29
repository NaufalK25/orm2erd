import { describe, it, expect } from "vitest";
import { S_CHECKBOX_INACTIVE } from "@clack/prompts";
import {
  computeColumns,
  formatCell,
  moveCursor,
  plainCellLength,
  type GridOption,
} from "../../src/core/grid-multiselect";

const option = (label: string, hint?: string): GridOption<string> => ({
  value: label,
  label,
  hint,
});

describe("plainCellLength", () => {
  it("accounts for the checkbox glyph, a space, and the label", () => {
    const withoutHint = plainCellLength(option("mermaid"));
    const withHint = plainCellLength(option("mermaid", "diagram"));
    // The hinted cell must be exactly ` (hint)` longer than the unhinted one.
    expect(withHint - withoutHint).toBe(" (diagram)".length);
  });
});

describe("computeColumns", () => {
  it("returns 1 when there's 0 or 1 option, regardless of width", () => {
    expect(computeColumns([], 200)).toBe(1);
    expect(computeColumns([option("only")], 200)).toBe(1);
  });

  it("never returns more columns than there are options", () => {
    const options = [option("a"), option("b")];
    expect(computeColumns(options, 1000)).toBeLessThanOrEqual(options.length);
  });

  it("caps at 3 columns even on a very wide terminal", () => {
    const options = Array.from({ length: 10 }, (_, i) => option(`opt${i}`));
    expect(computeColumns(options, 10_000)).toBe(3);
  });

  it("falls back to 1 column when the terminal is narrower than a single cell", () => {
    const options = [option("a-very-long-format-name-that-does-not-fit")];
    // length > 1 so the length<=1 shortcut doesn't apply here.
    const wide = [...options, option("b")];
    expect(computeColumns(wide, 1)).toBe(1);
  });
});

describe("formatCell", () => {
  it("uses the selected checkbox when isSelected is true, regardless of isActive", () => {
    const selected = formatCell(option("mermaid"), false, true);
    expect(selected.plain).toContain("mermaid");
    expect(selected.plain).not.toBe(
      formatCell(option("mermaid"), false, false).plain,
    );
  });

  it("appends the hint in parentheses to the plain label", () => {
    const { plain } = formatCell(option("mermaid", "diagram"), false, false);
    expect(plain).toBe(`${S_CHECKBOX_INACTIVE} mermaid (diagram)`);
  });

  it("omits the hint suffix entirely when there's no hint", () => {
    const { plain } = formatCell(option("mermaid"), false, false);
    expect(plain.endsWith("mermaid")).toBe(true);
  });
});

describe("moveCursor", () => {
  // A 2-column, 3-item grid:
  //   [0] [1]
  //   [2]
  const columns = 2;
  const total = 3;

  it("moves right within a row and wraps at the row's actual (possibly ragged) end", () => {
    expect(moveCursor(0, "right", columns, total)).toBe(1);
    expect(moveCursor(1, "right", columns, total)).toBe(0); // wraps within row 0
    expect(moveCursor(2, "right", columns, total)).toBe(2); // row 1 has only 1 item, wraps to itself
  });

  it("moves left within a row and wraps at the row's actual (possibly ragged) end", () => {
    expect(moveCursor(1, "left", columns, total)).toBe(0);
    expect(moveCursor(0, "left", columns, total)).toBe(1); // wraps within row 0
    expect(moveCursor(2, "left", columns, total)).toBe(2); // single-item row wraps to itself
  });

  it("moves down a column, skipping rows that don't reach that column", () => {
    // Column 0: row 0 (index 0) -> row 1 (index 2) -> back to row 0.
    expect(moveCursor(0, "down", columns, total)).toBe(2);
    expect(moveCursor(2, "down", columns, total)).toBe(0);
    // Column 1: only row 0 has it, so moving down from index 1 stays put.
    expect(moveCursor(1, "down", columns, total)).toBe(1);
  });

  it("moves up a column, skipping rows that don't reach that column", () => {
    expect(moveCursor(2, "up", columns, total)).toBe(0);
    expect(moveCursor(0, "up", columns, total)).toBe(2);
    expect(moveCursor(1, "up", columns, total)).toBe(1);
  });

  it("is a no-op when there's only a single row", () => {
    const singleRowTotal = 2; // 2 columns, 2 items: one full row
    expect(moveCursor(0, "up", columns, singleRowTotal)).toBe(0);
    expect(moveCursor(1, "down", columns, singleRowTotal)).toBe(1);
  });
});
