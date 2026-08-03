/**
 * Programmatic API for orm2erd: `detectORMs` to find which ORM a project uses,
 * `getAdapter`/`getEmitter` to parse its models into the `ERDModel` IR and
 * render that IR to a diagram format. Mirrors the CLI's own pipeline.
 */
export { detectORMs, detectors } from "./detect";
export type { Detector, DetectResult, DetectedORM } from "./detect";

export { adapters, getAdapter } from "./adapters";
export type { ORMAdapter, ResolvedEntry } from "./adapters";

export { emitters, getEmitter } from "./emitters";
export type { Emitter, EmitOptions } from "./emitters";

export type {
  ERDModel,
  Entity,
  Field,
  Relation,
  Index,
  CanonicalType,
  RelationAction,
} from "./core/model";
export type { ORMName } from "./core/orm";
export type {
  NameMode,
  OutputFormat,
  RelationLabelMode,
  TypeMode,
} from "./core/format";
