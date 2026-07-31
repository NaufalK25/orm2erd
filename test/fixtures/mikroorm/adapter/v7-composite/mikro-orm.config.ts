import { defineConfig } from "@mikro-orm/sqlite";

export default defineConfig({
  entitiesTs: ["./src/entities"],
  entities: ["./dist/entities"],
  dbName: ":memory:",
});
