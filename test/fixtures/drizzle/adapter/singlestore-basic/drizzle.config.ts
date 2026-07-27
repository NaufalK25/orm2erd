import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "singlestore",
  schema: "./schema.ts",
  out: "./drizzle",
  dbCredentials: { url: "mysql://localhost:3306/fixture" },
});
