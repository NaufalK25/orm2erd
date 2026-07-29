import "reflect-metadata";
import { DataSource, EntitySchema } from "typeorm";

const Product = new EntitySchema({
  name: "Product",
  columns: {
    id: { type: "int", primary: true, generated: true },
    sku: { type: "varchar", unique: true },
    quantity: { type: "int", nullable: true },
  },
});

export const AppDataSource = new DataSource({
  type: "sqljs",
  synchronize: false,
  entities: [Product],
});
