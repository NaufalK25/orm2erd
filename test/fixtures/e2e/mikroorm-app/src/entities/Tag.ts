import { Collection, Entity, ManyToMany, PrimaryKey, Property } from "@mikro-orm/core";
import { Post } from "./Post";

@Entity({ tableName: "tags" })
export class Tag {
  @PrimaryKey({ type: "integer" })
  id!: number;

  @Property({ type: "string", unique: true })
  name!: string;

  @ManyToMany(() => Post, (post) => post.tags)
  posts = new Collection<Post>(this);
}
