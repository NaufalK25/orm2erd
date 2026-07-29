import { describe, it, expect } from "vitest";
import { getAdapter } from "../../src/adapters";
import type { ORMName } from "../../src/core/orm";

describe("getAdapter", () => {
  it("returns the registered adapter for each supported ORM", () => {
    const names: ORMName[] = ["prisma", "sequelize", "mongoose"];
    for (const name of names) {
      expect(getAdapter(name).name).toBe(name);
    }
  });

  it("throws when no adapter is registered for the given ORM name", () => {
    expect(() => getAdapter("unknown-orm" as ORMName)).toThrow(
      /No adapter implemented yet for "unknown-orm"/,
    );
  });
});
