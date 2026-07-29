import { index, integer, pgTable, primaryKey, unique, varchar } from "drizzle-orm/pg-core";

export const postTags = pgTable(
  "post_tags",
  {
    postId: integer("post_id").notNull(),
    tagId: integer("tag_id").notNull(),
    addedBy: varchar("added_by", { length: 50 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
  },
  (table) => [
    primaryKey({ columns: [table.postId, table.tagId] }),
    unique("tag_addedby_unique").on(table.tagId, table.addedBy),
    index("addedby_idx").on(table.addedBy),
  ],
);
