import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mikroormAdapter } from "../../src/adapters/mikroorm";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/mikroorm/adapter",
);

async function extractFixture(dir: string, filename: string) {
  const cwd = join(fixturesDir, dir);
  const entry = await mikroormAdapter.resolveEntry(filename, cwd);
  return mikroormAdapter.extract(entry);
}

// These fixtures import decorators from `@mikro-orm/decorators`, which
// doesn't exist at all under a v6 install (it's a v7 package split) — kept
// in its own file, separate from mikroorm.test.ts's v6 fixtures, because
// running both a v6-broken import and a real assertion in the same worker
// has been observed to corrupt vitest's own error reporting for unrelated
// tests in that file, not just fail the one test that actually broke.
// Skips entirely under v6 (the dedicated `mikroorm-v7` CI job swaps v7 in on
// top of the v6-pinned default; see .github/workflows/ci.yml). Reading the
// installed package's own package.json (not a `require()` of the module
// itself) keeps this a cheap, side-effect-free version check.
const installedMikroOrmCoreVersion = JSON.parse(
  readFileSync(
    createRequire(import.meta.url).resolve("@mikro-orm/core/package.json"),
    "utf-8",
  ),
).version as string;
const isMikroOrmV7 = installedMikroOrmCoreVersion.startsWith("7.");

// MikroORM v7 moved classic decorators out of `@mikro-orm/core` into
// `@mikro-orm/decorators/legacy`, and `MetadataStorage.getAll()` returns a
// real `Map` instead of v6's plain `Dictionary` object — these fixtures
// exercise both of those under a real v7 install. Only a representative
// subset of the v6 "basic"/"composite" assertions is re-verified here (not
// full parity): everything else (folder discovery, embedded fields, relation
// dedup, etc.) is confirmed unchanged between versions and already covered
// in mikroorm.test.ts.
describe.skipIf(!isMikroOrmV7)(
  "mikroormAdapter.extract — MikroORM v7 (@mikro-orm/decorators)",
  () => {
    it("discovers every entity and normalizes getAll()'s Map return into the model", async () => {
      const model = await extractFixture("v7-basic", "mikro-orm.config.ts");
      expect(model.entities.map((e) => e.name).toSorted()).toEqual([
        "Post",
        "Tag",
        "User",
      ]);
    });

    it("synthesizes a FK field for an owning @ManyToOne and emits the 1-n relation with onDelete/onUpdate", async () => {
      const model = await extractFixture("v7-basic", "mikro-orm.config.ts");
      const post = model.entities.find((e) => e.name === "Post")!;
      expect(post.fields.find((f) => f.name === "author_id")).toMatchObject({
        type: "int",
        isForeignKey: true,
      });

      const userToPost = model.relations.find((r) => r.type === "1-n")!;
      expect(userToPost).toMatchObject({
        from: "User",
        to: "Post",
        onDelete: "cascade",
        onUpdate: "cascade",
      });
    });

    it("collapses an owning @ManyToMany pair into a single n-n relation", async () => {
      const model = await extractFixture("v7-basic", "mikro-orm.config.ts");
      const nnRelations = model.relations.filter((r) => r.type === "n-n");
      expect(nnRelations).toHaveLength(1);
      expect(nnRelations[0]).toMatchObject({ from: "Post", to: "Tag" });
    });

    it("carries a composite PK and multi-column @Unique()", async () => {
      const model = await extractFixture("v7-composite", "mikro-orm.config.ts");
      const postTag = model.entities.find((e) => e.name === "PostTag")!;
      expect(postTag.primaryKey).toEqual(["postId", "tagId"]);
      expect(postTag.uniques).toEqual([["tagId", "addedBy"]]);
      expect(postTag.fields.find((f) => f.name === "slug")?.isUnique).toBe(
        true,
      );
    });
  },
);
