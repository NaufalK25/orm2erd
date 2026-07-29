import { describe, it, expect } from "vitest";
import { getEmitter } from "../../src/emitters";
import type { OutputFormat } from "../../src/core/format";

describe("getEmitter", () => {
  it("returns the registered emitter for each supported format", () => {
    const formats: OutputFormat[] = ["mermaid", "dbml", "plantuml"];
    for (const format of formats) {
      expect(getEmitter(format).format).toBe(format);
    }
  });

  it("throws when no emitter is registered for the given format", () => {
    expect(() => getEmitter("unknown-format" as OutputFormat)).toThrow(
      /No emitter implemented yet for "unknown-format"/,
    );
  });
});
