// Shared between the detector (suggesting candidate files) and the future
// adapter (deciding which files are safe to import for their side effects)
// — both need the same answer to "does this file actually construct a
// TypeORM DataSource," so a mismatch would mean the detector finds a file
// the adapter then can't (or shouldn't) import.

const DATA_SOURCE_PATTERN = /\bnew\s+DataSource\s*\(/;
const TYPEORM_IMPORT_PATTERN =
  /from\s+["']typeorm["']|require\(\s*["']typeorm["']\s*\)/;

// Text-based, so a match inside a comment/string is possible — acceptable
// for the detector (only suggests candidates, user confirms in the picker).
export function looksLikeTypeOrmDataSourceSource(content: string): boolean {
  return (
    TYPEORM_IMPORT_PATTERN.test(content) && DATA_SOURCE_PATTERN.test(content)
  );
}
