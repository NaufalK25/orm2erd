// Shared between the detector (suggesting candidate directories) and the
// adapter (deciding which files in a directory are safe to import for their
// side effects) — both need the same answer to "does this file actually
// define a mongoose schema/model," so a mismatch between the two would mean
// the detector finds a narrow, correct directory but the adapter then
// blindly imports everything in it regardless.

// Matches mongoose.model(...)/conn.model(...)/bare model(...) (with
// optional TS generics) and new Schema(...)/new mongoose.Schema(...).
// Gated behind MONGOOSE_IMPORT_PATTERN since these alone are too generic
// (collide with Zod/Joi/GraphQL etc).
const SCHEMA_OR_MODEL_PATTERN =
  /\b(\w+\.)?model\s*(<[^>]*>)?\s*\(|\bnew\s+(mongoose\.)?Schema\s*\(/;
const MONGOOSE_IMPORT_PATTERN =
  /from\s+["']mongoose["']|require\(\s*["']mongoose["']\s*\)/;

// Text-based, so a match inside a comment/string is possible — acceptable
// for the detector (only suggests candidates, user confirms in the picker)
// and for the adapter (only decides what to import, not what to trust as data).
export function looksLikeMongooseSchemaSource(content: string): boolean {
  return (
    MONGOOSE_IMPORT_PATTERN.test(content) &&
    SCHEMA_OR_MODEL_PATTERN.test(content)
  );
}
