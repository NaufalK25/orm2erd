// End-to-end coverage the per-file unit tests (test/{detect,adapters,emitters})
// don't provide: the real detectORMs -> adapter.resolveEntry -> adapter.extract
// -> emitter.emit chain against a realistic sample app per ORM, catching wiring
// bugs between stages (e.g. detect suggesting a candidate the adapter can't
// actually resolve) that isolated unit tests can't see.
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { detectORMs } from "../../src/detect";
import { getAdapter } from "../../src/adapters";
import { mermaidEmitter } from "../../src/emitters/mermaid";
import { dbmlEmitter } from "../../src/emitters/dbml";
import type { ORMName } from "../../src/core/orm";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/e2e",
);

interface Case {
  orm: ORMName;
  dir: string;
  expectedCandidate: string;
}

const cases: Case[] = [
  {
    orm: "prisma",
    dir: "prisma-app",
    expectedCandidate: join("prisma", "schema.prisma"),
  },
  { orm: "sequelize", dir: "sequelize-app", expectedCandidate: "models" },
  { orm: "mongoose", dir: "mongoose-app", expectedCandidate: "models" },
  {
    orm: "typeorm",
    dir: "typeorm-app",
    expectedCandidate: join("src", "data-source.ts"),
  },
];

describe.each(cases)("$orm app fixture", ({ orm, dir, expectedCandidate }) => {
  const cwd = join(fixturesDir, dir);

  it("is detected by detectORMs with the expected entry candidate", async () => {
    const detected = await detectORMs(cwd);
    const match = detected.find((d) => d.name === orm);
    expect(match?.found).toBe(true);
    expect(match?.candidates).toContain(expectedCandidate);
  });

  it("resolves, extracts, and emits a non-trivial ERD matching the golden snapshot", async () => {
    const detected = await detectORMs(cwd);
    const match = detected.find((d) => d.name === orm)!;
    const adapter = getAdapter(orm);
    const entry = await adapter.resolveEntry(match.candidates[0], cwd);
    const model = await adapter.extract(entry);

    expect(model.entities.length).toBeGreaterThan(1);
    expect(model.relations.length).toBeGreaterThan(0);

    const mermaid = mermaidEmitter.emit(model, { typeMode: "canonical" });
    const dbml = dbmlEmitter.emit(model, { typeMode: "canonical" });

    await expect(mermaid).toMatchFileSnapshot(
      join(cwd, "__snapshots__", "erd.mmd"),
    );
    await expect(dbml).toMatchFileSnapshot(
      join(cwd, "__snapshots__", "erd.dbml"),
    );
  });
});
