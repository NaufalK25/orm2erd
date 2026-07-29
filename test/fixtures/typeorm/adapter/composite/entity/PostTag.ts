import { Entity, PrimaryColumn, Column, Unique, Index } from "typeorm";

// Composite primary key (two @PrimaryColumn) + a multi-column @Unique.
// The single-column `slug` unique stays on the field, not the group.
@Entity()
@Unique(["tagId", "addedBy"])
@Index("post_addedby_idx", ["postId", "addedBy"])
@Index(["addedBy"])
export class PostTag {
  @PrimaryColumn()
  postId: number;

  @PrimaryColumn()
  tagId: number;

  @Column()
  addedBy: string;

  @Column({ unique: true })
  slug: string;
}
