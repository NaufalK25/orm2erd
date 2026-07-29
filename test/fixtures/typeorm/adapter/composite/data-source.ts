import "reflect-metadata";
import { DataSource } from "typeorm";
import { PostTag } from "./entity/PostTag";

export const AppDataSource = new DataSource({
  type: "sqljs",
  synchronize: false,
  entities: [PostTag],
});
