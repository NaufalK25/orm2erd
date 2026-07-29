import "reflect-metadata";
import { DataSource } from "typeorm";
import { CustomerArchive } from "./entity/CustomerArchive";

export const AppDataSource = new DataSource({
  type: "sqljs",
  synchronize: false,
  entities: [CustomerArchive],
});
