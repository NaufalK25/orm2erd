import { Collection } from "@mikro-orm/core";
import {
  Entity,
  Index,
  ManyToMany,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/decorators/legacy";
import { User } from "./User";
import { Tag } from "./Tag";

@Entity({ tableName: "posts" })
@Index({ properties: ["title"] })
export class Post {
  @PrimaryKey({ type: "integer" })
  id!: number;

  @Property({ type: "string", fieldName: "post_title" })
  title!: string;

  @Property({ type: "text", nullable: true })
  content?: string;

  @ManyToOne(() => User, { deleteRule: "cascade", updateRule: "cascade" })
  author!: User;

  @ManyToMany(() => Tag, (tag) => tag.posts, { owner: true })
  tags = new Collection<Tag>(this);
}
