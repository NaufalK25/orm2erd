import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from "typeorm";
import { Post } from "./Post";

// A lone @ManyToOne with no reciprocal @OneToMany declared on Post — the
// "standalone many-to-one" case, as opposed to Post/User's owned pair above.
@Entity()
export class Comment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  body: string;

  @ManyToOne(() => Post)
  post: Post;
}
