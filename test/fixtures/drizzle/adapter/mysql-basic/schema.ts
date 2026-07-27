import { int, mysqlEnum, mysqlTable, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  role: mysqlEnum("role", ["admin", "member"]).notNull().default("member"),
});

export const accounts = mysqlTable("accounts", {
  id: int("id").autoincrement().primaryKey(),
  status: mysqlEnum("status", ["active", "suspended"]).notNull(),
  userId: int("user_id")
    .notNull()
    .references(() => users.id),
});
