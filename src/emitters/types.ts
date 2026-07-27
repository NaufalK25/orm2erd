import type { ERDModel } from "../core/model";
import type { OutputFormat, TypeMode } from "../core/format";

export interface EmitOptions {
  typeMode: TypeMode;
}

export interface Emitter {
  format: OutputFormat;
  /** Extension (without leading dot) used when deriving an output path from a base name. */
  fileExtension: string;
  /** Renders the IR to this emitter's diagram syntax as a string. Pure — no filesystem access. */
  emit(model: ERDModel, options: EmitOptions): string;
}
