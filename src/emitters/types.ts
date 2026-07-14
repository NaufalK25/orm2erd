import type { ERDModel } from "../core/model";
import type { OutputFormat } from "../core/format";

export interface Emitter {
  format: OutputFormat;
  fileExtension: string;
  emit(model: ERDModel): string;
}
