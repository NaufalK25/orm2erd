import {
  bigint,
  customType,
  doublePrecision,
  integer,
  jsonb,
  json,
  numeric,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// No built-in dataType maps to this — canonical type falls back to "unknown".
const vector = customType<{ data: number[] }>({
  dataType() {
    return "vector(3)";
  },
});

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    settings: json("settings"),
    preferences: jsonb("preferences"),
    externalId: bigint("external_id", { mode: "bigint" }),
    balance: numeric("balance", { mode: "number" }),
    score: doublePrecision("score"),
    rating: real("rating"),
    embedding: vector("embedding"),
    // A Date-instance default, not a literal or a `sql` expression.
    activatedAt: timestamp("activated_at").default(
      new Date("2024-01-01T00:00:00.000Z"),
    ),
    // A plain-object default (neither Date nor `sql`).
    profile: jsonb("profile").default({ theme: "dark" }),
  },
  (table) => [
    // Table-level single-column unique — distinct from a column-level
    // `.unique()` call, but must still land as a per-field isUnique flag.
    unique("users_email_unique").on(table.email),
  ],
);
