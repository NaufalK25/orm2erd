import { Entity, PrimaryGeneratedColumn, Column, OneToMany, OneToOne } from "typeorm";
import { Post } from "./Post";
import { Profile } from "./Profile";

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  name?: string;

  @OneToMany(() => Post, (post) => post.author)
  posts: Post[];

  @OneToOne(() => Profile, (profile) => profile.user)
  profile: Profile;
}
