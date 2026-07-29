import { describe, it, expect, afterEach } from "vitest";
import { PassThrough } from "node:stream";
import {
  gridMultiselect,
  type GridOption,
} from "../../src/core/grid-multiselect";

// Drives the real @clack/core Prompt through simulated keypresses over a
// PassThrough pair instead of a real TTY — node's readline still parses
// these into the same "keypress" events it would from an actual terminal.
function fakeStreams() {
  const input = new PassThrough();
  const output = new PassThrough();
  output.resume(); // drain rendered frames instead of letting them buffer
  return { input, output };
}

const KEY = {
  up: "\x1B[A",
  down: "\x1B[B",
  left: "\x1B[D",
  right: "\x1B[C",
  space: " ",
  enter: "\r",
  ctrlC: "\x03",
};

const options: GridOption<string>[] = [
  { value: "mermaid", label: "mermaid" },
  { value: "dbml", label: "dbml" },
  { value: "plantuml", label: "plantuml", hint: "uml" },
];

describe("gridMultiselect", () => {
  it("selects the option under the cursor with space and submits with enter", async () => {
    const { input, output } = fakeStreams();
    const promise = gridMultiselect({
      message: "pick a format",
      options,
      columns: 3,
      input,
      output,
    });
    input.write(KEY.space); // toggles "mermaid" (cursor starts at index 0)
    input.write(KEY.enter);
    await expect(promise).resolves.toEqual(["mermaid"]);
  });

  it("moves the cursor right before selecting", async () => {
    const { input, output } = fakeStreams();
    const promise = gridMultiselect({
      message: "pick a format",
      options,
      columns: 3,
      input,
      output,
    });
    input.write(KEY.right); // index 0 -> 1 ("dbml")
    input.write(KEY.space);
    input.write(KEY.enter);
    await expect(promise).resolves.toEqual(["dbml"]);
  });

  it("wraps left from the first option back to the last in its row", async () => {
    const { input, output } = fakeStreams();
    const promise = gridMultiselect({
      message: "pick a format",
      options,
      columns: 3,
      input,
      output,
    });
    input.write(KEY.left); // wraps 0 -> 2 ("plantuml")
    input.write(KEY.space);
    input.write(KEY.enter);
    await expect(promise).resolves.toEqual(["plantuml"]);
  });

  it("toggles a selection back off when space is pressed twice", async () => {
    const { input, output } = fakeStreams();
    const promise = gridMultiselect({
      message: "pick a format",
      options,
      columns: 3,
      input,
      output,
      required: false,
    });
    input.write(KEY.space);
    input.write(KEY.space);
    input.write(KEY.enter);
    await expect(promise).resolves.toEqual([]);
  });

  it("selects every option when 'a' is pressed, and deselects all on a second press", async () => {
    const { input, output } = fakeStreams();
    const promise = gridMultiselect({
      message: "pick a format",
      options,
      columns: 3,
      input,
      output,
      required: false,
    });
    input.write("a");
    input.write("a");
    input.write(KEY.enter);
    await expect(promise).resolves.toEqual([]);
  });

  it("selects every option when 'a' is pressed once", async () => {
    const { input, output } = fakeStreams();
    const promise = gridMultiselect({
      message: "pick a format",
      options,
      columns: 3,
      input,
      output,
    });
    input.write("a");
    input.write(KEY.enter);
    await expect(promise).resolves.toEqual(["mermaid", "dbml", "plantuml"]);
  });

  it("re-prompts (doesn't submit) when enter is pressed with nothing selected and required is true", async () => {
    const { input, output } = fakeStreams();
    const promise = gridMultiselect({
      message: "pick a format",
      options,
      columns: 3,
      input,
      output,
      required: true,
    });
    input.write(KEY.enter); // rejected by validate(): nothing selected yet
    input.write(KEY.space);
    input.write(KEY.enter);
    await expect(promise).resolves.toEqual(["mermaid"]);
  });

  it("resolves with the CANCEL symbol on ctrl+c", async () => {
    const { input, output } = fakeStreams();
    const promise = gridMultiselect({
      message: "pick a format",
      options,
      columns: 3,
      input,
      output,
    });
    input.write(KEY.ctrlC);
    const result = await promise;
    expect(typeof result).toBe("symbol");
  });

  it("cancels with a selection already made, without throwing", async () => {
    const { input, output } = fakeStreams();
    const promise = gridMultiselect({
      message: "pick a format",
      options,
      columns: 3,
      input,
      output,
    });
    input.write(KEY.space); // select "mermaid" before cancelling
    input.write(KEY.ctrlC);
    const result = await promise;
    expect(typeof result).toBe("symbol");
  });

  it("starts with the given initial values already selected", async () => {
    const { input, output } = fakeStreams();
    const promise = gridMultiselect({
      message: "pick a format",
      options,
      columns: 3,
      input,
      output,
      initialValues: ["dbml"],
    });
    input.write(KEY.enter);
    await expect(promise).resolves.toEqual(["dbml"]);
  });

  describe("auto-computed column count (no explicit `columns` option)", () => {
    const original = process.stdout.columns;

    afterEach(() => {
      process.stdout.columns = original;
    });

    it("falls back to 80 when process.stdout.columns is unset (no real TTY)", async () => {
      process.stdout.columns = undefined as unknown as number;
      const { input, output } = fakeStreams();
      const promise = gridMultiselect({
        message: "pick a format",
        options,
        input,
        output,
      });
      input.write(KEY.space);
      input.write(KEY.enter);
      await expect(promise).resolves.toEqual(["mermaid"]);
    });

    it("uses process.stdout.columns when it's set", async () => {
      process.stdout.columns = 120;
      const { input, output } = fakeStreams();
      const promise = gridMultiselect({
        message: "pick a format",
        options,
        input,
        output,
      });
      input.write(KEY.space);
      input.write(KEY.enter);
      await expect(promise).resolves.toEqual(["mermaid"]);
    });
  });

  it("breaks out of a ragged last row instead of rendering a phantom cell", async () => {
    const raggedOptions: GridOption<string>[] = [
      ...options,
      { value: "quickdbd", label: "quickdbd" },
    ];
    const { input, output } = fakeStreams();
    const promise = gridMultiselect({
      message: "pick a format",
      options: raggedOptions,
      columns: 3,
      input,
      output,
    });
    // 4 options over 3 columns leaves a single-item second row — rendering
    // it must not crash on the missing 2nd/3rd cells in that row.
    input.write(KEY.space);
    input.write(KEY.enter);
    await expect(promise).resolves.toEqual(["mermaid"]);
  });
});
