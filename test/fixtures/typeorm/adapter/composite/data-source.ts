import "reflect-metadata";
import { DataSource } from "typeorm";
import { Membership } from "./entity/Membership";

export const AppDataSource = new DataSource({
  type: "sqljs",
  synchronize: false,
  entities: [Membership],
});
