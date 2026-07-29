import { int, singlestoreTable, varchar } from "drizzle-orm/singlestore-core";

export const tags = singlestoreTable("tags", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
});
