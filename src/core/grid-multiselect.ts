import { Prompt, type PromptOptions } from "@clack/core";
import type { Readable, Writable } from "node:stream";
import pc from "picocolors";
import {
  formatInstructionFooter,
  symbol,
  symbolBar,
  unicode,
  S_BAR,
  S_BAR_END,
  S_CHECKBOX_ACTIVE,
  S_CHECKBOX_INACTIVE,
  S_CHECKBOX_SELECTED,
} from "@clack/prompts";

export interface GridOption<Value> {
  value: Value;
  label: string;
  hint?: string;
}

export interface GridMultiSelectOptions<Value> {
  message: string;
  options: GridOption<Value>[];
  initialValues?: Value[];
  required?: boolean;
  /** Column count; auto-computed from terminal width and label length when omitted. */
  columns?: number;
  input?: Readable;
  output?: Writable;
  signal?: AbortSignal;
}

// Same checkbox glyph width in every state (active/selected/inactive), so
// this alone determines each cell's plain-text (unstyled) length for padding.
const CHECKBOX_WIDTH = S_CHECKBOX_INACTIVE.length;
const COLUMN_GAP = 2;
const MAX_AUTO_COLUMNS = 3;

export function plainCellLength(option: GridOption<unknown>): number {
  const hint = option.hint ? ` (${option.hint})` : "";
  return CHECKBOX_WIDTH + 1 + option.label.length + hint.length;
}

export function computeColumns(
  options: GridOption<unknown>[],
  termWidth: number,
): number {
  if (options.length <= 1) return 1;
  const cellWidth = Math.max(...options.map(plainCellLength)) + COLUMN_GAP;
  const byWidth = Math.max(1, Math.floor(termWidth / cellWidth));
  return Math.max(1, Math.min(MAX_AUTO_COLUMNS, byWidth, options.length));
}

export function formatCell<Value>(
  option: GridOption<Value>,
  isActive: boolean,
  isSelected: boolean,
): { plain: string; styled: string } {
  const checkbox = isSelected
    ? S_CHECKBOX_SELECTED
    : isActive
      ? S_CHECKBOX_ACTIVE
      : S_CHECKBOX_INACTIVE;
  const hint = option.hint ? ` (${option.hint})` : "";
  const plain = `${checkbox} ${option.label}${hint}`;

  const styledCheckbox = isSelected
    ? pc.green(checkbox)
    : isActive
      ? pc.cyan(checkbox)
      : pc.dim(checkbox);
  const styledLabel =
    isActive || isSelected ? option.label : pc.dim(option.label);
  const styledHint = option.hint ? pc.dim(hint) : "";

  return { plain, styled: `${styledCheckbox} ${styledLabel}${styledHint}` };
}

// The last row is often shorter than `columns` (e.g. 7 options in 3 columns
// leaves a single-item last row), so up/down/left/right all need to clamp
// against each row's actual length rather than wrapping through the flat
// option array, which would land on the wrong item whenever the target row
// is ragged.
export function moveCursor(
  cursor: number,
  dir: "up" | "down" | "left" | "right",
  columns: number,
  total: number,
): number {
  const rowCount = Math.ceil(total / columns);
  const rowLength = (row: number) =>
    row === rowCount - 1 ? total - columns * (rowCount - 1) : columns;
  const row = Math.floor(cursor / columns);
  const col = cursor - row * columns;

  switch (dir) {
    case "up": {
      // Skip past any row that doesn't reach this column (a ragged last
      // row) instead of clamping into it, so every row that does have this
      // column stays reachable by column, wrapping fully around before
      // giving up and staying put.
      let targetRow = row;
      do {
        targetRow = targetRow === 0 ? rowCount - 1 : targetRow - 1;
      } while (targetRow !== row && col >= rowLength(targetRow));
      return targetRow * columns + col;
    }
    case "down": {
      let targetRow = row;
      do {
        targetRow = targetRow === rowCount - 1 ? 0 : targetRow + 1;
      } while (targetRow !== row && col >= rowLength(targetRow));
      return targetRow * columns + col;
    }
    case "left": {
      const len = rowLength(row);
      const targetCol = col === 0 ? len - 1 : col - 1;
      return row * columns + targetCol;
    }
    case "right": {
      const len = rowLength(row);
      const targetCol = col === len - 1 ? 0 : col + 1;
      return row * columns + targetCol;
    }
  }
}

interface InternalOptions<Value> extends PromptOptions<
  Value[],
  GridMultiSelectPrompt<Value>
> {
  options: GridOption<Value>[];
  initialValues?: Value[];
  columns: number;
}

class GridMultiSelectPrompt<Value> extends Prompt<Value[]> {
  options: GridOption<Value>[];
  cursor = 0;
  columns: number;

  constructor(opts: InternalOptions<Value>) {
    super(opts, false);
    this.options = opts.options;
    this.columns = opts.columns;
    this.value = [...(opts.initialValues ?? [])];

    const total = this.options.length;

    this.on("cursor", (key) => {
      if (key === "space") {
        this.toggleValue();
        return;
      }
      if (key === "up" || key === "down" || key === "left" || key === "right") {
        this.cursor = moveCursor(this.cursor, key, this.columns, total);
      }
    });

    this.on("key", (key) => {
      if (key === "a") this.toggleAll();
    });
  }

  private toggleValue(): void {
    const option = this.options[this.cursor];
    if (!option) return;
    const values = this.value ?? [];
    const index = values.indexOf(option.value);
    this.value =
      index >= 0
        ? values.filter((_, i) => i !== index)
        : [...values, option.value];
  }

  private toggleAll(): void {
    const values = this.value ?? [];
    this.value =
      values.length === this.options.length
        ? []
        : this.options.map((o) => o.value);
  }
}

const INSTRUCTIONS = [
  `${pc.dim(unicode ? "↑/↓/←/→" : "up/down/left/right")} navigate`,
  `${pc.dim("Space:")} select`,
  `${pc.dim("a:")} toggle all`,
  `${pc.dim("Enter:")} confirm`,
];

// A `multiselect` variant that lays options out in a column grid instead of
// one per line, so long format lists stay compact instead of growing the
// prompt's height. Built directly on @clack/core's Prompt primitive because
// @clack/prompts' own `multiselect` only renders a single column.
export function gridMultiselect<Value>(
  opts: GridMultiSelectOptions<Value>,
): Promise<Value[] | symbol> {
  const required = opts.required ?? true;
  const columns =
    opts.columns ?? computeColumns(opts.options, process.stdout.columns ?? 80);
  const totalRows = Math.ceil(opts.options.length / columns);
  const cellWidth = Math.max(...opts.options.map(plainCellLength));

  return new GridMultiSelectPrompt<Value>({
    options: opts.options,
    initialValues: opts.initialValues,
    input: opts.input,
    output: opts.output,
    signal: opts.signal,
    columns,
    validate(value) {
      if (required && (value === undefined || value.length === 0)) {
        return "Please select at least one option.";
      }
    },
    render() {
      const header = `${symbol(this.state)}  ${opts.message}`;

      if (this.state === "submit") {
        const values = this.value ?? [];
        const selected =
          opts.options
            .filter((o) => values.includes(o.value))
            .map((o) => o.label)
            .join(pc.dim(", ")) || pc.dim("none");
        return `${header}\n${pc.gray(S_BAR)}  ${selected}`;
      }

      if (this.state === "cancel") {
        const values = this.value ?? [];
        const selected = opts.options
          .filter((o) => values.includes(o.value))
          .map((o) => pc.strikethrough(pc.dim(o.label)))
          .join(", ");
        return `${header}\n${pc.gray(S_BAR)}${selected ? `  ${selected}` : ""}`;
      }

      const values = this.value ?? [];
      const rows: string[] = [];
      for (let r = 0; r < totalRows; r++) {
        const cells: string[] = [];
        for (let c = 0; c < columns; c++) {
          const index = r * columns + c;
          const option = opts.options[index];
          if (!option) break;
          const { plain, styled } = formatCell(
            option,
            this.cursor === index,
            values.includes(option.value),
          );
          const isLastInRow =
            c === columns - 1 || index === opts.options.length - 1;
          cells.push(
            styled +
              " ".repeat(cellWidth - plain.length) +
              (isLastInRow ? "" : "  "),
          );
        }
        rows.push(`${symbolBar(this.state)}  ${cells.join("")}`);
      }

      if (this.state === "error") {
        return [
          header,
          ...rows,
          `${pc.yellow(S_BAR_END)}  ${pc.yellow(this.error)}`,
        ].join("\n");
      }

      return [
        header,
        ...rows,
        ...formatInstructionFooter(INSTRUCTIONS, true),
      ].join("\n");
    },
  }).prompt() as Promise<Value[] | symbol>;
}
