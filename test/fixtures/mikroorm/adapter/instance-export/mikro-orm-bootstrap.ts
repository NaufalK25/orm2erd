import { MikroORM } from "@mikro-orm/sqlite";
import { ReflectMetadataProvider } from "@mikro-orm/decorators/legacy";
import { User } from "./src/entities/User";

export default MikroORM.init({
  entities: [User],
  dbName: ":memory:",
  connect: false,
  metadataProvider: ReflectMetadataProvider,
});
