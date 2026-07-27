import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "mysql",
  schema: "./schema.ts",
  out: "./drizzle",
  dbCredentials: { url: "mysql://localhost:3306/fixture" },
});
