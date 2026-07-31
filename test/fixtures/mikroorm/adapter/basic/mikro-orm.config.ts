import { defineConfig } from "@mikro-orm/sqlite";
import { ReflectMetadataProvider } from "@mikro-orm/decorators/legacy";

export default defineConfig({
  entities: ["./dist/entities"],
  entitiesTs: ["./src/entities"],
  dbName: ":memory:",
  // v7's default metadataProvider is no longer reflection-based now that
  // decorators live in a separate package — a project relying on implicit
  // (emitDecoratorMetadata-inferred) property types, like this fixture's
  // `@PrimaryKey()` with no explicit `type`, has to opt back into this.
  metadataProvider: ReflectMetadataProvider,
});
