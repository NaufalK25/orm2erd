import { defineConfig } from "@mikro-orm/sqlite";
import { ReflectMetadataProvider } from "@mikro-orm/decorators/legacy";

export default defineConfig({
  entities: ["./dist/entities"],
  entitiesTs: ["./src/entities"],
  dbName: ":memory:",
  // v7's default metadataProvider is no longer reflection-based now that
  // decorators live in a separate package — a real v7 project relying on
  // implicit (emitDecoratorMetadata-inferred) property types, like this
  // fixture's `@PrimaryKey()`/`@Property()` with no explicit `type`, has to
  // opt back into this itself. Unlike everything else in this config, this
  // isn't something orm2erd's adapter needs to inject: it's just passed
  // through like any other target-supplied MikroORM option.
  metadataProvider: ReflectMetadataProvider,
});
