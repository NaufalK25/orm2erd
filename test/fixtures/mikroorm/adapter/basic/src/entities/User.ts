import { Collection, Entity, OneToMany, PrimaryKey, Property } from "@mikro-orm/core";
import { Post } from "./Post";

@Entity({ tableName: "users", comment: "App users" })
export class User {
  @PrimaryKey()
  id!: number;

  @Property({ unique: true })
  email!: string;

  @Property({ type: "text", nullable: true })
  bio?: string;

  @Property({ type: "boolean", default: true })
  isActive: boolean = true;

  @OneToMany(() => Post, (post) => post.author)
  posts = new Collection<Post>(this);
}
