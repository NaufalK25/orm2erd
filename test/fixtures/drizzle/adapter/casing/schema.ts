import { integer, pgTable, serial, text } from "drizzle-orm/pg-core";

export const teams = pgTable("teams", {
  id: serial().primaryKey(),
  teamName: text().notNull(),
});

export const teamMembers = pgTable("team_members", {
  id: serial().primaryKey(),
  fullName: text().notNull(),
  teamId: integer()
    .notNull()
    .references(() => teams.id),
});
