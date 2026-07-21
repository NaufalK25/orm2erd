import "reflect-metadata";
import { DataSource, EntitySchema } from "typeorm";

const Widget = new EntitySchema({
  name: "Widget",
  columns: {
    id: { type: "int", primary: true, generated: true },
    label: { type: "varchar", unique: true },
    quantity: { type: "int", nullable: true },
  },
});

export const AppDataSource = new DataSource({
  type: "sqljs",
  synchronize: false,
  entities: [Widget],
});
