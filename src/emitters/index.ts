import type { OutputFormat } from "../core/format";
import type { Emitter } from "./types";
import { mermaidEmitter } from "./mermaid";
import { dbmlEmitter } from "./dbml";

export type { Emitter } from "./types";

export const emitters: Partial<Record<OutputFormat, Emitter>> = {
  mermaid: mermaidEmitter,
  dbml: dbmlEmitter,
};

export function getEmitter(format: OutputFormat): Emitter {
  const emitter = emitters[format];
  if (!emitter) {
    throw new Error(`No emitter implemented yet for "${format}"`);
  }
  return emitter;
}
