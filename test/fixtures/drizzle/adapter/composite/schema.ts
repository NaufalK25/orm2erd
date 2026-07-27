import { index, integer, pgTable, primaryKey, unique, varchar } from "drizzle-orm/pg-core";

export const memberships = pgTable(
  "memberships",
  {
    userId: integer("user_id").notNull(),
    orgId: integer("org_id").notNull(),
    role: varchar("role", { length: 50 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.orgId] }),
    unique("org_role_unique").on(table.orgId, table.role),
    index("role_idx").on(table.role),
  ],
);
