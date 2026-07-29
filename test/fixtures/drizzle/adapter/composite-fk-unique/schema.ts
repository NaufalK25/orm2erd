import {
  foreignKey,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  unique,
} from "drizzle-orm/pg-core";

// Tenant-scoped composite PK — a single "id" alone isn't unique across tenants.
export const users = pgTable(
  "users",
  {
    tenantId: integer("tenant_id").notNull(),
    id: integer("id").notNull(),
    name: text("name").notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] })],
);

// A composite FK (table-level foreignKey(), not the single-column
// `.references()` chain) that's also covered by a composite unique — the
// declared-1-1 signal isColumnSetUnique looks for beyond a single
// unique/primary column.
export const posts = pgTable(
  "posts",
  {
    id: serial("id").primaryKey(),
    authorTenantId: integer("author_tenant_id").notNull(),
    authorId: integer("author_id").notNull(),
    title: text("title").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.authorTenantId, t.authorId],
      foreignColumns: [users.tenantId, users.id],
    }),
    unique("posts_author_unique").on(t.authorTenantId, t.authorId),
  ],
);
