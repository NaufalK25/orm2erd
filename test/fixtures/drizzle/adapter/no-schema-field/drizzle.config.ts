import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  out: "./drizzle",
  dbCredentials: { url: "postgres://localhost:5432/fixture" },
});
