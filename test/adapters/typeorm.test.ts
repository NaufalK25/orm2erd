import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { typeormAdapter } from "../../src/adapters/typeorm";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/typeorm/adapter",
);

// `dir` is either a fixturesDir-relative name ("basic") or an absolute path
// (a per-test mkdtempSync dir, for the error-case tests below).
async function extractFixture(dir: string, filename: string) {
  const cwd = isAbsolute(dir) ? dir : join(fixturesDir, dir);
  const entry = await typeormAdapter.resolveEntry(filename, cwd);
  return typeormAdapter.extract(entry);
}

describe("typeormAdapter.resolveEntry", () => {
  it("resolves a relative path against cwd into an absolute path", async () => {
    const entry = await typeormAdapter.resolveEntry(
      "data-source.ts",
      join(fixturesDir, "basic"),
    );
    expect(entry.path).toBe(join(fixturesDir, "basic", "data-source.ts"));
  });

  it("throws when the path is a directory, not a file", async () => {
    await expect(
      typeormAdapter.resolveEntry("basic", fixturesDir),
    ).rejects.toThrow(/not a file/);
  });
});

describe("typeormAdapter.extract — raw .ts DataSource (compiled via the target's own tsc)", () => {
  it("extracts every declared entity, excluding the synthesized many-to-many junction table", async () => {
    const model = await extractFixture("basic", "data-source.ts");
    expect(model.entities.map((e) => e.name).toSorted()).toEqual([
      "Post",
      "Profile",
      "Tag",
      "User",
    ]);
  });

  it("maps column types, primary keys, and defaults", async () => {
    const model = await extractFixture("basic", "data-source.ts");
    const post = model.entities.find((e) => e.name === "Post")!;
    const id = post.fields.find((f) => f.name === "id")!;
    const title = post.fields.find((f) => f.name === "title")!;
    const published = post.fields.find((f) => f.name === "published")!;
    expect(id.isPrimaryKey).toBe(true);
    expect(id.isNullable).toBe(false);
    expect(id.type).toBe("int");
    expect(title.type).toBe("string");
    expect(published.type).toBe("boolean");
    expect(published.defaultValue).toBe("false");
  });

  it("detects foreign key columns from relations, not just column definitions", async () => {
    const model = await extractFixture("basic", "data-source.ts");
    const post = model.entities.find((e) => e.name === "Post")!;
    const author = post.fields.find((f) => f.name === "author")!;
    expect(author.isForeignKey).toBe(true);
  });

  it("detects a single-column unique constraint from @Column({ unique: true })", async () => {
    const model = await extractFixture("basic", "data-source.ts");
    const user = model.entities.find((e) => e.name === "User")!;
    const email = user.fields.find((f) => f.name === "email")!;
    expect(email.isUnique).toBe(true);
  });

  it("builds a 1-n relation from the @OneToMany/@ManyToOne pair, owned by the FK side", async () => {
    const model = await extractFixture("basic", "data-source.ts");
    const userToPost = model.relations.filter(
      (r) => r.type === "1-n" && r.from === "User" && r.to === "Post",
    );
    expect(userToPost).toHaveLength(1);
    expect(userToPost[0].toColumn).toBe("author");
  });

  it("builds a 1-1 relation from the owning @OneToOne/@JoinColumn side", async () => {
    const model = await extractFixture("basic", "data-source.ts");
    const profileToUser = model.relations.filter(
      (r) => r.type === "1-1" && r.from === "Profile" && r.to === "User",
    );
    expect(profileToUser).toHaveLength(1);
  });

  it("collapses a @ManyToMany/@JoinTable pair into a single n-n relation", async () => {
    const model = await extractFixture("basic", "data-source.ts");
    const postTag = model.relations.filter(
      (r) =>
        r.type === "n-n" &&
        [r.from, r.to].toSorted().join(",") ===
          ["Post", "Tag"].toSorted().join(","),
    );
    expect(postTag).toHaveLength(1);
  });

  it("produces exactly one relation per real relationship, not one per declared side", async () => {
    const model = await extractFixture("basic", "data-source.ts");
    expect(model.relations).toHaveLength(3);
  });
});

describe("typeormAdapter.extract — plain .js entry (no tsc compile needed)", () => {
  it("passes an EntitySchema-defined entity straight through", async () => {
    const model = await extractFixture("entity-schema", "data-source.js");
    expect(model.entities).toHaveLength(1);
    const widget = model.entities[0];
    expect(widget.name).toBe("Widget");
    expect(widget.fields.map((f) => f.name).toSorted()).toEqual([
      "id",
      "label",
      "quantity",
    ]);
    expect(widget.fields.find((f) => f.name === "label")!.isUnique).toBe(true);
  });
});

describe("typeormAdapter.extract — legacy ormconfig.json", () => {
  it("parses JSON connection options and resolves .ts glob entities via the same tsc-compiled mirror", async () => {
    const model = await extractFixture("legacy-ormconfig", "ormconfig.json");
    expect(model.entities).toHaveLength(1);
    expect(model.entities[0].name).toBe("Gadget");
    const serial = model.entities[0].fields.find((f) => f.name === "serial")!;
    expect(serial.isUnique).toBe(true);
  });

  it("rejects a non-JSON legacy ormconfig with a clear, actionable error", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "orm2erd-typeorm-ormconfig-"));
    writeFileSync(join(cwd, "ormconfig.yml"), "type: sqljs\n");
    await expect(extractFixture(cwd, "ormconfig.yml")).rejects.toThrow(
      /isn't supported yet/,
    );
  });
});

describe("typeormAdapter.extract — error cases", () => {
  it("throws a clear error when no tsconfig.json can be found for a .ts entry", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "orm2erd-typeorm-no-tsconfig-"));
    writeFileSync(
      join(cwd, "data-source.ts"),
      'import { DataSource } from "typeorm";\nexport const AppDataSource = new DataSource({ type: "sqljs" });\n',
    );
    await expect(extractFixture(cwd, "data-source.ts")).rejects.toThrow(
      /Could not find a tsconfig\.json/,
    );
  });

  it("throws a clear error when no DataSource is exported", async () => {
    await expect(extractFixture("no-datasource", "empty.ts")).rejects.toThrow(
      /Could not find a TypeORM DataSource/,
    );
  });
});
