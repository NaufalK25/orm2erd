import { defineConfig } from "@mikro-orm/sqlite";
import { ReflectMetadataProvider } from "@mikro-orm/decorators/legacy";

export default defineConfig({
  entitiesTs: ["./src/entities"],
  entities: ["./dist/entities"],
  dbName: ":memory:",
  metadataProvider: ReflectMetadataProvider,
});
