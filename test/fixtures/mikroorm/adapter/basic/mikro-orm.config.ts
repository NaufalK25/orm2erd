import { defineConfig } from "@mikro-orm/sqlite";

export default defineConfig({
  entities: ["./dist/entities"],
  entitiesTs: ["./src/entities"],
  dbName: ":memory:",
});
