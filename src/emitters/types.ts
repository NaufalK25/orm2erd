import type { ERDModel } from "../core/model";
import type {
  NameMode,
  OutputFormat,
  RelationLabelMode,
  TypeMode,
} from "../core/format";

export interface EmitOptions {
  typeMode: TypeMode;
  /** Entity/field identifier display mode. Defaults to "model" (current/legacy behavior) when omitted. */
  nameMode?: NameMode;
  /** Relation edge label mode. Defaults to "both" (current alias+column disambiguation) when omitted. */
  relationLabelMode?: RelationLabelMode;
}

export interface Emitter {
  format: OutputFormat;
  /** Extension (without leading dot) used when deriving an output path from a base name. */
  fileExtension: string;
  /** Renders the IR to this emitter's diagram syntax as a string. Pure — no filesystem access. */
  emit(model: ERDModel, options: EmitOptions): string;
}
