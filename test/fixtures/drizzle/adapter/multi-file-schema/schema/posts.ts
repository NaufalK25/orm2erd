import { integer, pgTable, serial, text } from "drizzle-orm/pg-core";
import { authors } from "./authors";

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  authorId: integer("author_id")
    .notNull()
    .references(() => authors.id),
});
