import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prismaAdapter } from "../../src/adapters/prisma";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/prisma",
);

describe("prismaAdapter.resolveEntry", () => {
  it("passes the given path through unchanged", async () => {
    const entry = await prismaAdapter.resolveEntry(
      "/some/path/schema.prisma",
      fixturesDir,
    );
    expect(entry.path).toBe("/some/path/schema.prisma");
  });
});

describe("prismaAdapter.resolveEntry — prisma.config.*", () => {
  const detectFixturesDir = join(fixturesDir, "detect");

  it("resolves the schema path from prisma.config.* when the given input doesn't exist", async () => {
    const cwd = join(detectFixturesDir, "config-only");
    const entry = await prismaAdapter.resolveEntry("prisma/schema.prisma", cwd);
    expect(entry.path).toBe(join(cwd, "custom/schema.prisma"));
  });

  it("prefers an existing input path over prisma.config.*", async () => {
    const cwd = join(detectFixturesDir, "config-with-decoy");
    const entry = await prismaAdapter.resolveEntry("prisma/schema.prisma", cwd);
    expect(entry.path).toBe(join(cwd, "prisma/schema.prisma"));
  });
});

describe.each([
  ["single-file schema", join(fixturesDir, "single/schema.prisma")],
  ["multi-file schema directory", join(fixturesDir, "multi/schema")],
])("prismaAdapter.extract — %s", (_label, schemaPath) => {
  it("extracts all entities", async () => {
    const entry = await prismaAdapter.resolveEntry(schemaPath, fixturesDir);
    const model = await prismaAdapter.extract(entry);
    expect(model.entities.map((e) => e.name).toSorted()).toEqual([
      "Post",
      "Tag",
      "User",
    ]);
  });

  it("marks primary keys and unique fields correctly", async () => {
    const entry = await prismaAdapter.resolveEntry(schemaPath, fixturesDir);
    const model = await prismaAdapter.extract(entry);
    const user = model.entities.find((e) => e.name === "User")!;
    expect(user.fields.find((f) => f.name === "id")?.isPrimaryKey).toBe(true);
    expect(user.fields.find((f) => f.name === "email")?.isUnique).toBe(true);
  });

  it("detects foreign keys from relation fields", async () => {
    const entry = await prismaAdapter.resolveEntry(schemaPath, fixturesDir);
    const model = await prismaAdapter.extract(entry);
    const post = model.entities.find((e) => e.name === "Post")!;
    expect(post.fields.find((f) => f.name === "userId")?.isForeignKey).toBe(
      true,
    );
  });

  it("captures enum values and default values", async () => {
    const entry = await prismaAdapter.resolveEntry(schemaPath, fixturesDir);
    const model = await prismaAdapter.extract(entry);
    const post = model.entities.find((e) => e.name === "Post")!;
    const status = post.fields.find((f) => f.name === "status")!;
    expect(status.enumValues).toEqual(["draft", "published"]);
    expect(status.defaultValue).toBe("draft");
  });

  it("collapses each relation field pair into a single relation", async () => {
    const entry = await prismaAdapter.resolveEntry(schemaPath, fixturesDir);
    const model = await prismaAdapter.extract(entry);
    expect(model.relations).toHaveLength(2);

    const userToPost = model.relations.find(
      (r) => r.type === "1-n" && r.from === "User" && r.to === "Post",
    );
    expect(userToPost).toBeDefined();

    const postTag = model.relations.find(
      (r) =>
        r.type === "n-n" &&
        [r.from, r.to].toSorted().join(",") ===
          ["Post", "Tag"].toSorted().join(","),
    );
    expect(postTag).toBeDefined();
  });
});

describe("prismaAdapter.extract — composite keys", () => {
  const schemaPath = join(fixturesDir, "composite/schema.prisma");

  it("carries composite PK and multi-column unique as IR arrays", async () => {
    const entry = await prismaAdapter.resolveEntry(schemaPath, fixturesDir);
    const model = await prismaAdapter.extract(entry);
    const membership = model.entities.find((e) => e.name === "Membership")!;

    expect(membership.primaryKey).toEqual(["userId", "orgId"]);
    expect(membership.uniques).toEqual([["orgId", "role"]]);
    // Composite PK members still carry the per-field marker.
    expect(
      membership.fields.find((f) => f.name === "userId")?.isPrimaryKey,
    ).toBe(true);
  });

  it("leaves primaryKey/uniques undefined when nothing is composite", async () => {
    const entry = await prismaAdapter.resolveEntry(
      join(fixturesDir, "single/schema.prisma"),
      fixturesDir,
    );
    const model = await prismaAdapter.extract(entry);
    const user = model.entities.find((e) => e.name === "User")!;

    expect(user.primaryKey).toBeUndefined();
    expect(user.uniques).toBeUndefined();
  });
});
