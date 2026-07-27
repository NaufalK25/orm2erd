import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "turso",
  schema: "./schema.ts",
  out: "./drizzle",
  dbCredentials: { url: "libsql://example.turso.io", authToken: "x" },
});
