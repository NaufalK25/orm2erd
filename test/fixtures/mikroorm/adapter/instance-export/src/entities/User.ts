import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "users" })
export class User {
  @PrimaryKey({ type: "integer" })
  id!: number;

  @Property({ type: "string" })
  name!: string;
}
