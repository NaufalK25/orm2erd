import type { ORMName } from "../core/orm";
import type { ORMAdapter } from "./types";
import { prismaAdapter } from "./prisma";
import { sequelizeAdapter } from "./sequelize";

export type { ORMAdapter, ResolvedEntry } from "./types";

export const adapters: Partial<Record<ORMName, ORMAdapter>> = {
  prisma: prismaAdapter,
  sequelize: sequelizeAdapter,
};

export function getAdapter(name: ORMName): ORMAdapter {
  const adapter = adapters[name];
  if (!adapter) {
    throw new Error(`No adapter implemented yet for "${name}"`);
  }
  return adapter;
}
