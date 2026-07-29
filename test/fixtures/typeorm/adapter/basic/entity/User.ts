import { Entity, PrimaryGeneratedColumn, Column, OneToMany, OneToOne } from "typeorm";
import { Post } from "./Post";
import { Profile } from "./Profile";

@Entity({ comment: "Registered application users." })
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true, comment: "The user's display name." })
  name?: string;

  // No explicit `type` — TypeORM infers it from reflect-metadata's
  // design:type (a `Date` constructor here), not a driver-specific string.
  @Column()
  createdAt: Date;

  // Same implicit-type inference, but design:type is a plain `Object`
  // constructor — matches none of the known implicit-type cases.
  @Column()
  metadata: object;

  // A function-valued default (TypeORM's documented "raw SQL expression"
  // pattern), not a literal value.
  @Column({ default: () => "now()" })
  lastSeenAt: string;

  // A plain-object default (neither undefined, a function, nor a Date) —
  // must be JSON-stringified.
  @Column({ type: "simple-json", default: { role: "member" } })
  preferences: object;

  @OneToMany(() => Post, (post) => post.author)
  posts: Post[];

  @OneToOne(() => Profile, (profile) => profile.user)
  profile: Profile;
}
