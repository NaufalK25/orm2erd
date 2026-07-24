import { Entity, PrimaryColumn, Column, Unique } from "typeorm";

// Composite primary key (two @PrimaryColumn) + a multi-column @Unique.
// The single-column `slug` unique stays on the field, not the group.
@Entity()
@Unique(["orgId", "role"])
export class Membership {
  @PrimaryColumn()
  userId: number;

  @PrimaryColumn()
  orgId: number;

  @Column()
  role: string;

  @Column({ unique: true })
  slug: string;
}
