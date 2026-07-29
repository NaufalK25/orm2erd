import { integer, pgTable, serial, text } from "drizzle-orm/pg-core";

export const posts = pgTable("posts", {
  id: serial().primaryKey(),
  postTitle: text().notNull(),
});

export const comments = pgTable("comments", {
  id: serial().primaryKey(),
  commentBody: text().notNull(),
  postId: integer()
    .notNull()
    .references(() => posts.id),
});
