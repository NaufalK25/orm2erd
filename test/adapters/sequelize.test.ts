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

  it("carries table/attribute `comment` as entity and field descriptions", async () => {
    const model = await extractFixture("named-export.js");
    const user = model.entities.find((e) => e.name === "User")!;
    expect(user.description).toBe("Registered application users.");
    expect(user.fields.find((f) => f.name === "name")?.description).toBe(
      "The user's display name.",
    );
    expect(
      user.fields.find((f) => f.name === "email")?.description,
    ).toBeUndefined();
  });

  it("leaves description undefined when no comment option is set", async () => {
    const model = await extractFixture("named-export.js");
    const post = model.entities.find((e) => e.name === "Post")!;
    expect(post.description).toBeUndefined();
  });
});

describe("sequelizeAdapter.extract — native type mapping (#5a/#5b)", () => {
  it("reads the DataType's public key, not its internal constructor name (JSONTYPE -> JSON)", async () => {
    const model = await extractFixture("types.js");
    const doc = model.entities.find((e) => e.name === "Product")!;
    const metadata = doc.fields.find((f) => f.name === "metadata")!;
    expect(metadata.nativeType).toBe("JSON");
    expect(metadata.type).toBe("json");
  });

  it("maps JSONB and UUID to their canonical types", async () => {
    const model = await extractFixture("types.js");
    const doc = model.entities.find((e) => e.name === "Product")!;
    expect(doc.fields.find((f) => f.name === "settings")?.type).toBe("json");
    expect(doc.fields.find((f) => f.name === "externalRef")?.type).toBe(
      "string",
    );
  });

  it("unwraps ARRAY(STRING) to its element type and sets isList", async () => {
    const model = await extractFixture("types.js");
    const doc = model.entities.find((e) => e.name === "Product")!;
    const tags = doc.fields.find((f) => f.name === "tags")!;
    expect(tags.type).toBe("string");
    expect(tags.nativeType).toBe("STRING");
    expect(tags.isList).toBe(true);
  });

  it("unwraps ARRAY(ENUM), reusing the same enum_<model>_<field> naming path as a bare ENUM", async () => {
    const model = await extractFixture("types.js");
    const doc = model.entities.find((e) => e.name === "Product")!;
    const roles = doc.fields.find((f) => f.name === "roles")!;
    expect(roles.type).toBe("enum");
    expect(roles.nativeType).toBe("enum_Product_roles");
    expect(roles.enumValues).toEqual(["admin", "member"]);
    expect(roles.isList).toBe(true);
  });

  it("leaves isList false for non-array columns", async () => {
    const model = await extractFixture("types.js");
    const doc = model.entities.find((e) => e.name === "Product")!;
    expect(doc.fields.find((f) => f.name === "settings")?.isList).toBe(false);
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
    // derived Post<->Tag crossing is redundant and dropped.
    expect(model.relations.some((r) => r.type === "n-n")).toBe(false);
    expect(
      model.relations.filter((r) => r.type === "1-n" && r.to === "PostTag"),
    ).toHaveLength(2);
    expect(model.relations).toHaveLength(2);
  });
});

describe("sequelizeAdapter.extract — FK marking respects association direction", () => {
  it("does not mark a plain column as FK just because a HasMany elsewhere on the model shares its name", async () => {
    const model = await extractFixture("backwards-relations.js");
    const order = model.entities.find((e) => e.name === "Order")!;
    const orderCode = order.fields.find((f) => f.name === "orderCode")!;
    expect(orderCode.isForeignKey).toBeFalsy();
  });

  it("still marks the real FK column from the owning BelongsTo association", async () => {
    const model = await extractFixture("backwards-relations.js");
    const item = model.entities.find((e) => e.name === "OrderItem")!;
    const orderCode = item.fields.find((f) => f.name === "orderCode")!;
    expect(orderCode.isForeignKey).toBe(true);
  });

  it("marks the FK column even when only the parent's HasMany is declared, with no reciprocal BelongsTo", async () => {
    const model = await extractFixture("backwards-relations.js");
    const shipment = model.entities.find((e) => e.name === "Shipment")!;
    const warehouseId = shipment.fields.find((f) => f.name === "warehouseId")!;
    expect(warehouseId.isForeignKey).toBe(true);
  });
});

describe("sequelizeAdapter.extract — BelongsTo with no reciprocal HasMany/HasOne", () => {
  it("puts the parent (not the FK-holding child) on the `from` side", async () => {
    const model = await extractFixture("backwards-relations.js");
    const rel = model.relations.find(
      (r) => r.from === "Customer" && r.to === "Invoice",
    );
    expect(rel).toBeDefined();
    expect(
      model.relations.some((r) => r.from === "Invoice" && r.to === "Customer"),
    ).toBe(false);
  });

  it("renders 1-n, not a forced 1-1, when the FK column isn't unique", async () => {
    const model = await extractFixture("backwards-relations.js");
    const rel = model.relations.find(
      (r) => r.from === "Customer" && r.to === "Invoice",
    )!;
    expect(rel.type).toBe("1-n");
    expect(rel.toColumn).toBe("customerId");
  });

  it("renders 1-1 when the lone BelongsTo's FK column is unique", async () => {
    const model = await extractFixture("backwards-relations.js");
    const rel = model.relations.find(
      (r) => r.from === "Customer" && r.to === "Account",
    )!;
    expect(rel.type).toBe("1-1");
  });

  it("keeps 1-1 parent-on-left for an explicit HasOne/BelongsTo pair even when the FK isn't unique", async () => {
    const model = await extractFixture("backwards-relations.js");
    const rel = model.relations.find(
      (r) => r.from === "Customer" && r.to === "Transaction",
    )!;
    expect(rel.type).toBe("1-1");
    expect(
      model.relations.some(
        (r) => r.from === "Transaction" && r.to === "Customer",
      ),
    ).toBe(false);
  });
});

describe("sequelizeAdapter.extract — relation actions", () => {
  it("reads onDelete/onUpdate off the FK attribute, not association.options", async () => {
    const model = await extractFixture("named-export.js");
    const userToPost = model.relations.find(
      (r) => r.type === "1-n" && r.from === "User" && r.to === "Post",
    )!;
    expect(userToPost.onDelete).toBe("cascade");
    expect(userToPost.onUpdate).toBe("cascade");
  });

  it("leaves onDelete/onUpdate undefined for a relation with no FK column to attach them to", async () => {
    const model = await extractFixture("named-export.js");
    const postTag = model.relations.find((r) => r.type === "n-n")!;
    expect(postTag.onDelete).toBeUndefined();
    expect(postTag.onUpdate).toBeUndefined();
  });
});

describe("sequelizeAdapter.extract — composite keys", () => {
  it("carries composite PK and multi-column unique, ignoring single-column and non-unique indexes", async () => {
    const model = await extractFixture("composite-keys.js");
    const postTag = model.entities.find((e) => e.name === "PostTag")!;

    expect(postTag.primaryKey).toEqual(["postId", "tagId"]);
    // Only the multi-column unique index; `slug` (single) and the non-unique
    // composite index are excluded.
    expect(postTag.uniques).toEqual([["tagId", "addedBy"]]);
    // Composite PK members still carry the per-field marker.
    expect(postTag.fields.find((f) => f.name === "postId")?.isPrimaryKey).toBe(
      true,
    );
  });

  it("leaves primaryKey/uniques undefined for a single-PK model", async () => {
    const model = await extractFixture("named-export.js");
    const user = model.entities.find((e) => e.name === "User")!;
    expect(user.primaryKey).toBeUndefined();
    expect(user.uniques).toBeUndefined();
  });

  it("carries non-unique `options.indexes` entries as plain indexes", async () => {
    const model = await extractFixture("composite-keys.js");
    const postTag = model.entities.find((e) => e.name === "PostTag")!;

    expect(postTag.indexes).toEqual([
      { fields: ["postId", "addedBy"], name: "post_addedby_idx" },
      { fields: ["addedBy"] },
    ]);
  });

  it("leaves indexes undefined when only unique indexes are declared", async () => {
    const model = await extractFixture("named-export.js");
    const user = model.entities.find((e) => e.name === "User")!;
    expect(user.indexes).toBeUndefined();
  });

  it("carries a composite unique declared via the unique: 'groupName' shorthand, mapping uniqueKeys' physical column names back to attribute names (#4b)", async () => {
    const model = await extractFixture("composite-keys.js");
    const comment = model.entities.find((e) => e.name === "Comment")!;
    expect(comment.uniques).toEqual([["postId", "authorId"]]);
  });

  it("does not surface a uniqueKeys single-column group as a composite unique", async () => {
    const model = await extractFixture("composite-keys.js");
    const comment = model.entities.find((e) => e.name === "Comment")!;
    expect(comment.fields.find((f) => f.name === "permalink")?.isUnique).toBe(
      true,
    );
    expect(comment.uniques?.some((g) => g.includes("permalink"))).toBe(false);
  });
});

describe("sequelizeAdapter.extract — isFromOptional (#1)", () => {
  it("sets isFromOptional false for a HasMany-declared 1-n with a NOT NULL FK", async () => {
    const model = await extractFixture("optional-fk.js");
    const rel = model.relations.find(
      (r) => r.from === "Customer" && r.to === "Invoice",
    )!;
    expect(rel.isFromOptional).toBe(false);
  });

  it("sets isFromOptional true for a HasMany-declared 1-n with a nullable FK", async () => {
    const model = await extractFixture("optional-fk.js");
    const rel = model.relations.find(
      (r) => r.from === "Customer" && r.to === "Payment",
    )!;
    expect(rel.isFromOptional).toBe(true);
  });

  it("sets isFromOptional false for a 1-1 with a NOT NULL FK", async () => {
    const model = await extractFixture("optional-fk.js");
    const rel = model.relations.find(
      (r) => r.from === "Product" && r.to === "Barcode",
    )!;
    expect(rel.type).toBe("1-1");
    expect(rel.isFromOptional).toBe(false);
  });

  it("sets isFromOptional true for a 1-1 with a nullable FK", async () => {
    const model = await extractFixture("optional-fk.js");
    const rel = model.relations.find(
      (r) => r.from === "Supplier" && r.to === "Contract",
    )!;
    expect(rel.type).toBe("1-1");
    expect(rel.isFromOptional).toBe(true);
  });

  it("treats a composite-PK FK column as NOT NULL even though rawAttributes never sets allowNull on it", async () => {
    const model = await extractFixture("optional-fk.js");
    const rel = model.relations.find(
      (r) => r.from === "Order" && r.to === "OrderItem",
    )!;
    expect(rel.isFromOptional).toBe(false);
  });
});
