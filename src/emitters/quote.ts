/**
 * Low-level identifier-safety checks shared by emitters that only need to
 * quote an identifier conditionally (Mermaid, DBML, PlantUML, QuickDBD).
 * Which character(s) actually require quoting, what quote character to use,
 * and which identifier *kinds* (entity vs. field) are affected all differ
 * per format — verified empirically against each format's own grammar
 * rather than assumed — so each emitter composes its own small wrapper from
 * these primitives instead of sharing one `needsQuoting()` call. D2 and
 * GraphvizDOT already quote unconditionally/safely and don't use this.
 */

export function hasSpace(identifier: string): boolean {
  return /\s/.test(identifier);
}

export function hasHyphen(identifier: string): boolean {
  return /-/.test(identifier);
}
