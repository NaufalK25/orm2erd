import { Collection } from "@mikro-orm/core";
import {
  Entity,
  ManyToMany,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/decorators/legacy";
import { Post } from "./Post";
import { User } from "./User";

@Entity({ tableName: "tags" })
export class Tag {
  @PrimaryKey()
  id!: number;

  @Property()
  name!: string;

  // Standalone @ManyToOne with no matching @OneToMany back-reference on
  // User — must still emit its own 1-n relation from buildRelation's "m:1"
  // case, not just when paired from the "one" side.
  @ManyToOne(() => User)
  createdBy!: User;

  @ManyToMany(() => Post, (post) => post.tags)
  posts = new Collection<Post>(this);
}
