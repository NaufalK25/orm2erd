import type { ORMName } from "../core/orm";
import type { ORMAdapter } from "./types";
import { prismaAdapter } from "./prisma";
import { sequelizeAdapter } from "./sequelize";
import { mongooseAdapter } from "./mongoose";
import { typeormAdapter } from "./typeorm";
import { drizzleAdapter } from "./drizzle";
import { mikroormAdapter } from "./mikroorm";

export type { ORMAdapter, ResolvedEntry } from "./types";

export const adapters: Partial<Record<ORMName, ORMAdapter>> = {
  prisma: prismaAdapter,
  sequelize: sequelizeAdapter,
  mongoose: mongooseAdapter,
  typeorm: typeormAdapter,
  drizzle: drizzleAdapter,
  mikroorm: mikroormAdapter,
};

/** Looks up the adapter for `name`. Throws if that ORM has no adapter implemented yet. */
export function getAdapter(name: ORMName): ORMAdapter {
  const adapter = adapters[name];
  if (!adapter) {
    throw new Error(`No adapter implemented yet for "${name}"`);
  }
  return adapter;
}
