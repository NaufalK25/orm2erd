import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  body: text("body").notNull(),
});

export const comments = sqliteTable("comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  postId: integer("post_id")
    .notNull()
    .references(() => posts.id),
});
