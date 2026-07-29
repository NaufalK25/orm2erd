import { int, mysqlEnum, mysqlTable, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  role: mysqlEnum("role", ["admin", "member"]).notNull().default("member"),
});

export const posts = mysqlTable("posts", {
  id: int("id").autoincrement().primaryKey(),
  status: mysqlEnum("status", ["draft", "published"]).notNull(),
  authorId: int("author_id")
    .notNull()
    .references(() => users.id),
});
