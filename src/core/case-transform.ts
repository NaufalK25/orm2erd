import type { CaseMode } from "./format";

// Splits on any run of non-alphanumeric characters, plus camelCase/PascalCase
// humps (including acronym boundaries, e.g. "HTTPServer" -> "HTTP Server"),
// so the identifier's *source* casing convention (snake_case, camelCase,
// PascalCase, kebab-case, ...) never needs to be detected up front — every
// convention tokenizes into the same word list, which is then rejoined in
// whichever case the caller asked for.
function splitWords(identifier: string): string[] {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function toCase(identifier: string, mode: CaseMode): string {
  if (mode === "preserve" || !identifier) return identifier;

  // Letter-folding only — no re-tokenizing/re-joining, so existing
  // separators/word boundaries (snake_case, camelCase humps, ...) are left
  // exactly where they are; only the letters themselves change case.
  if (mode === "lower") return identifier.toLowerCase();
  if (mode === "upper") return identifier.toUpperCase();

  const words = splitWords(identifier);
  if (words.length === 0) return identifier;

  switch (mode) {
    case "snake":
      return words.map((w) => w.toLowerCase()).join("_");
    case "screaming_snake":
      return words.map((w) => w.toUpperCase()).join("_");
    case "kebab":
      return words.map((w) => w.toLowerCase()).join("-");
    case "camel":
      return words
        .map((w, i) => (i === 0 ? w.toLowerCase() : capitalize(w)))
        .join("");
    case "pascal":
      return words.map(capitalize).join("");
    case "title":
      return words.map(capitalize).join(" ");
  }
}
