import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./schema.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: { url: "postgres://localhost:5432/fixture" },
});
