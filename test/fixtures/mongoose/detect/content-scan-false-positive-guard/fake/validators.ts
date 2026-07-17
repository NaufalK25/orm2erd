// Deliberately does NOT import mongoose — a lookalike from an unrelated
// validation library (e.g. Zod/Joi-style), which the import gate should
// keep out of the candidate list.
class Schema {
  constructor(shape: Record<string, unknown>) {}
}

export const userSchema = new Schema({
  name: "string",
});

export function model(name: string) {
  return name;
}
