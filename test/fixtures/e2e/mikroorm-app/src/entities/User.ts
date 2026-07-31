import { Collection, Entity, OneToMany, OneToOne, PrimaryKey, Property } from "@mikro-orm/core";
import { Post } from "./Post";
import { Profile } from "./Profile";

@Entity({ tableName: "users", comment: "Registered application users." })
export class User {
  @PrimaryKey({ type: "integer" })
  id!: number;

  @Property({ type: "string", unique: true })
  email!: string;

  @Property({ type: "string", comment: "The user's display name." })
  name!: string;

  @OneToOne(() => Profile, (profile) => profile.user)
  profile?: Profile;

  @OneToMany(() => Post, (post) => post.author)
  posts = new Collection<Post>(this);
}
