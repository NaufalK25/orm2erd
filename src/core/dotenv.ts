// Loaded in priority order (.env.local wins on shared keys) since
// loadEnvFile doesn't override vars already set by an earlier call.
// Best-effort: most projects only have one of these, if any. Shared by the
// Sequelize and Mongoose adapters, which both need target-project env vars
// (e.g. a DB connection string) available before importing the entry file.
export function loadDotEnvFiles(): void {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(file);
    } catch {}
  }
}
