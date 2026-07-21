import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sequelizeAdapter } from "../../src/adapters/sequelize";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/sequelize",
);

async function extractFixture(filename: string) {
  const entry = await sequelizeAdapter.resolveEntry(
    join(fixturesDir, filename),
    fixturesDir,
  );
  return sequelizeAdapter.extract(entry);
}

describe("sequelizeAdapter.resolveEntry", () => {
  it("resolves a relative path against cwd into an absolute path", async () => {
    const entry = await sequelizeAdapter.resolveEntry(
      "named-export.js",
      fixturesDir,
    );
    expect(entry.path).toBe(join(fixturesDir, "named-export.js"));
  });

  it("returns the directory itself when no index.js/.ts aggregator is found inside", async () => {
    const entry = await sequelizeAdapter.resolveEntry(
      fixturesDir,
      dirname(fixturesDir),
    );
    expect(entry.path).toBe(fixturesDir);
  });
});

describe("sequelizeAdapter.extract — directory without an aggregator", () => {
  it("throws a clear 'not supported yet' error", async () => {
    const entry = await sequelizeAdapter.resolveEntry(
      fixturesDir,
      dirname(fixturesDir),
    );
    await expect(sequelizeAdapter.extract(entry)).rejects.toThrow(
      /isn't supported yet/,
    );
  });
});

describe("sequelizeAdapter.extract — export shapes", () => {
  it("finds a named export directly (mod.sequelize)", async () => {
    const model = await extractFixture("named-export.js");
    expect(model.entities.map((e) => e.name).toSorted()).toEqual([
      "Post",
      "Tag",
      "User",
    ]);
  });

  it("finds the instance nested in a CJS db object (mod.default.sequelize)", async () => {
    const model = await extractFixture("cjs-db-object.cjs");
    expect(model.entities).toHaveLength(1);
    expect(model.entities[0].name).toBe("User");
  });

  it("finds the instance behind a double-wrapped CJS default export (mod.default.default)", async () => {
    const model = await extractFixture("cjs-double-wrapped-default.cjs");
    expect(model.entities).toHaveLength(1);
    expect(model.entities[0].name).toBe("User");
  });

  it("finds the instance on a Model class's static .sequelize", async () => {
    const model = await extractFixture("model-class-static.cjs");
    expect(model.entities).toHaveLength(1);
    expect(model.entities[0].name).toBe("User");
  });

  it("throws a clear error instead of silently returning nothing for Sequelize v7's Set-shaped .models", async () => {
    await expect(extractFixture("v7-set-models.js")).rejects.toThrow(
      /Unsupported Sequelize version/,
    );
  });

  it("loads sequelize-cli's generated index.js, which uses __filename/__dirname/require at module scope", async () => {
    const model = await extractFixture("cli-generated-index.ts");
    expect(model.entities).toHaveLength(1);
    expect(model.entities[0].name).toBe("User");
  });
});

describe("sequelizeAdapter.extract — field mapping", () => {
  it("marks primary keys as non-nullable even without an explicit allowNull", async () => {
    const model = await extractFixture("named-export.js");
    const user = model.entities.find((e) => e.name === "User")!;
    const id = user.fields.find((f) => f.name === "id")!;
    expect(id.isPrimaryKey).toBe(true);
    expect(id.isNullable).toBe(false);
  });

  it("detects foreign keys from associations, not just column definitions", async () => {
    const model = await extractFixture("named-export.js");
    const post = model.entities.find((e) => e.name === "Post")!;
    const userId = post.fields.find((f) => f.name === "userId")!;
    expect(userId.isForeignKey).toBe(true);
  });

  it("captures enum values and stringifies default values", async () => {
    const model = await extractFixture("named-export.js");
    const post = model.entities.find((e) => e.name === "Post")!;
    const status = post.fields.find((f) => f.name === "status")!;
    expect(status.enumValues).toEqual(["draft", "published"]);
    expect(status.defaultValue).toBe("draft");
  });

  it("resolves a sentinel DataType default (e.g. DataTypes.UUIDV4) to its constructor name, not '{}'", async () => {
    const model = await extractFixture("named-export.js");
    const user = model.entities.find((e) => e.name === "User")!;
    const externalId = user.fields.find((f) => f.name === "externalId")!;
    expect(externalId.defaultValue).toBe("UUIDV4()");
  });

  it("resolves a Sequelize.literal(...) default to its raw SQL expression, not the stringified wrapper", async () => {
    const model = await extractFixture("named-export.js");
    const post = model.entities.find((e) => e.name === "Post")!;
    const id = post.fields.find((f) => f.name === "id")!;
    expect(id.defaultValue).toBe("nextval('posts_id_seq')");
  });
});

describe("sequelizeAdapter.extract — relation dedup", () => {
  it("collapses a HasMany/BelongsTo pair into a single 1-n relation", async () => {
    const model = await extractFixture("named-export.js");
    const userToPost = model.relations.filter(
      (r) => r.type === "1-n" && r.from === "User" && r.to === "Post",
    );
    expect(userToPost).toHaveLength(1);
  });

  it("collapses a BelongsToMany pair into a single n-n relation, despite foreignKey/otherKey swapping between sides", async () => {
    const model = await extractFixture("named-export.js");
    const postTagRelations = model.relations.filter(
      (r) =>
        r.type === "n-n" &&
        [r.from, r.to].toSorted().join(",") ===
          ["Post", "Tag"].toSorted().join(","),
    );
    expect(postTagRelations).toHaveLength(1);
  });

  it("produces exactly one relation per real relationship, not one per association side", async () => {
    const model = await extractFixture("named-export.js");
    expect(model.relations).toHaveLength(2);
  });

  it("suppresses the derived n-n when the BelongsToMany's through table is itself an emitted entity", async () => {
    const model = await extractFixture("explicit-join-table.js");
    // The junction is rendered, and both sides link to it via 1-n; the
    // derived Department<->Group crossing is redundant and dropped.
    expect(model.relations.some((r) => r.type === "n-n")).toBe(false);
    expect(
      model.relations.filter(
        (r) => r.type === "1-n" && r.to === "DepartmentGroup",
      ),
    ).toHaveLength(2);
    expect(model.relations).toHaveLength(2);
  });
});
