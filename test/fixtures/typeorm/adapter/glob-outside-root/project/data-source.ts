import "reflect-metadata";
import { DataSource } from "typeorm";
import { User } from "./entity/User";

export const AppDataSource = new DataSource({
  type: "sqljs",
  synchronize: false,
  // The class import above is already enough to build metadata for User;
  // this glob exists only to exercise rewriteEntityGlobs' "outside the
  // project root" branch — it deliberately matches nothing.
  entities: [User, "../outside/**/*.ts"],
});
