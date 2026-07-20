import type { OutputFormat } from "../core/format";
import type { Emitter } from "./types";
import { mermaidEmitter } from "./mermaid";
import { dbmlEmitter } from "./dbml";
import { plantumlEmitter } from "./plantuml";
import { d2Emitter } from "./d2";
import { nomnomlEmitter } from "./nomnoml";

export type { Emitter } from "./types";

export const emitters: Partial<Record<OutputFormat, Emitter>> = {
  mermaid: mermaidEmitter,
  dbml: dbmlEmitter,
  plantuml: plantumlEmitter,
  d2: d2Emitter,
  nomnoml: nomnomlEmitter,
};

export function getEmitter(format: OutputFormat): Emitter {
  const emitter = emitters[format];
  if (!emitter) {
    throw new Error(`No emitter implemented yet for "${format}"`);
  }
  return emitter;
}
