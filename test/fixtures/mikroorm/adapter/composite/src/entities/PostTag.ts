import { Entity, PrimaryKey, Property, Unique } from "@mikro-orm/decorators/legacy";

// Composite primary key (two @PrimaryKey) + a multi-column @Unique. The
// single-column `slug` unique stays on the field, not the group — mirrors
// TypeORM's own "composite" fixture (test/fixtures/typeorm/adapter/composite).
@Entity()
@Unique({ properties: ["tagId", "addedBy"] })
export class PostTag {
  @PrimaryKey({ type: "integer" })
  postId!: number;

  @PrimaryKey({ type: "integer" })
  tagId!: number;

  @Property({ type: "string" })
  addedBy!: string;

  @Property({ type: "string", unique: true })
  slug!: string;
}
