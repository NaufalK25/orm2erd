import { Entity, OneToOne, PrimaryKey, Property } from "@mikro-orm/core";
import { User } from "./User";

@Entity({ tableName: "profiles" })
export class Profile {
  @PrimaryKey({ type: "integer" })
  id!: number;

  @Property({ type: "text", nullable: true })
  bio?: string;

  @OneToOne(() => User, { owner: true, inversedBy: "profile", deleteRule: "cascade" })
  user!: User;
}
