import type { ERDModel } from "../core/model";
import type { OutputFormat, TypeMode } from "../core/format";

interface EmitOptions {
  typeMode: TypeMode;
}

export interface Emitter {
  format: OutputFormat;
  fileExtension: string;
  emit(model: ERDModel, options: EmitOptions): string;
}
