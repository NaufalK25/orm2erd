/**
 * Identifier checks for emitters that quote only when needed (Mermaid, DBML,
 * PlantUML, QuickDBD). Which characters need quoting differs per format, so
 * each emitter builds its own wrapper from these. D2 and Graphviz DOT always quote.
 */

export function hasSpace(identifier: string): boolean {
  return /\s/.test(identifier);
}

export function hasHyphen(identifier: string): boolean {
  return /-/.test(identifier);
}
