import { defineConfig } from "@mikro-orm/sqlite";

export default defineConfig({
  entities: ["./compiled"],
  dbName: ":memory:",
});
