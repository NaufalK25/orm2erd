import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  // A directory, not a glob — resolveSchemaFiles must expand it to its
  // immediate importable files rather than treating it as a literal path.
  schema: "./schema",
  out: "./drizzle",
  dbCredentials: { url: "postgres://localhost:5432/fixture" },
});
