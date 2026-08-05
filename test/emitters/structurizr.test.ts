import { describe, it, expect } from "vitest";
import { structurizrEmitter } from "../../src/emitters/structurizr";
import type { ERDModel } from "../../src/core/model";

describe("structurizrEmitter", () => {
  it("renders an entity as a `element` declaration with column properties", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "User",
          description: "Registered platform users.",
          fields: [
            {
              name: "id",
              type: "int",
              nativeType: "SERIAL",
              isPrimaryKey: true,
              isNullable: false,
            },
            {
              name: "email",
              type: "string",
              nativeType: "VARCHAR(255)",
              isUnique: true,
              isNullable: false,
            },
            {
              name: "bio",
              type: "string",
              nativeType: "TEXT",
              isNullable: true,
            },
          ],
        },
      ],
      relations: [],
    };

    const output = structurizrEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain('workspace "ERD" {');
    expect(output).toContain(
      'User = element "User" "Table" "Registered platform users." "Entity" {',
    );
    expect(output).toContain(
      '"column.id" "int, PK, NOT NULL (native: SERIAL)"',
    );
    expect(output).toContain(
      '"column.email" "string, UNIQUE, NOT NULL (native: VARCHAR(255))"',
    );
    expect(output).toContain('"column.bio" "string, NULL (native: TEXT)"');
  });

  it("omits the native-type parenthetical in native type mode", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "User",
          fields: [{ name: "id", type: "int", nativeType: "SERIAL" }],
        },
      ],
      relations: [],
    };

    const output = structurizrEmitter.emit(model, { typeMode: "native" });

    expect(output).toContain('"column.id" "SERIAL, NOT NULL"');
    expect(output).not.toContain("native:");
  });

  it("inlines enum values and appends [] to list fields", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "Post",
          fields: [
            {
              name: "status",
              type: "enum",
              nativeType: "post_status",
              enumValues: ["draft", "published"],
              defaultValue: "'draft'",
            },
            {
              name: "tags",
              type: "string",
              nativeType: "TEXT[]",
              isList: true,
              isNullable: true,
            },
          ],
        },
      ],
      relations: [],
    };

    const output = structurizrEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain(
      '"column.status" "enum(draft, published), NOT NULL, DEFAULT \'draft\' (native: post_status)"',
    );
    expect(output).toContain('"column.tags" "string[], NULL (native: TEXT[])"');
  });

  it("only emits primaryKey/unique properties for composite groups, not single-column ones", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "OrderItem",
          fields: [
            { name: "orderId", type: "int", nativeType: "INTEGER" },
            { name: "productId", type: "int", nativeType: "INTEGER" },
          ],
          primaryKey: ["orderId", "productId"],
          uniques: [["orderId", "productId"]],
          indexes: [{ fields: ["orderId"], name: "idx_order_items_order" }],
        },
        {
          name: "User",
          fields: [
            {
              name: "id",
              type: "int",
              nativeType: "SERIAL",
              isPrimaryKey: true,
            },
          ],
        },
      ],
      relations: [],
    };

    const output = structurizrEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain('"primaryKey" "orderId, productId"');
    expect(output).toContain('"unique.1" "orderId, productId"');
    expect(output).toContain('"index.idx_order_items_order" "orderId"');
    // Single-column PK entity gets no redundant `primaryKey` property —
    // the field-level "PK" in its column value already says so.
    expect(output).not.toMatch(/"primaryKey" "id"/);
  });

  it("sanitizes DSL identifiers that collide with reserved keywords or contain invalid characters", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "model",
          fields: [{ name: "id", type: "int", nativeType: "INT" }],
        },
        {
          name: "Post-Tag",
          fields: [{ name: "id", type: "int", nativeType: "INT" }],
        },
      ],
      relations: [{ from: "model", to: "Post-Tag", type: "1-n" }],
    };

    const output = structurizrEmitter.emit(model, { typeMode: "canonical" });

    expect(output).not.toMatch(/\bmodel = element/);
    expect(output).toMatch(/model_1 = element/);
    expect(output).toMatch(/Post_Tag = element/);
    expect(output).toContain("model_1 -> Post_Tag");
  });

  it("renders relations with FK technology and cardinality tags, including self-referential", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "User",
          fields: [{ name: "id", type: "int", nativeType: "SERIAL" }],
        },
        {
          name: "Post",
          fields: [{ name: "authorId", type: "int", nativeType: "INTEGER" }],
        },
        {
          name: "Category",
          fields: [{ name: "parentId", type: "int", nativeType: "INTEGER" }],
        },
      ],
      relations: [
        {
          from: "User",
          to: "Post",
          type: "1-n",
          fieldName: "posts",
          fromColumn: "id",
          toColumn: "authorId",
          onDelete: "set null",
          onUpdate: "cascade",
          isFromOptional: false,
        },
        {
          from: "Category",
          to: "Category",
          type: "1-n",
          fieldName: "subcategories",
          fromColumn: "id",
          toColumn: "parentId",
        },
        { from: "Post", to: "Category", type: "n-n" },
      ],
    };

    const output = structurizrEmitter.emit(model, {
      typeMode: "canonical",
      relationLabelMode: "alias",
    });

    expect(output).toContain('User -> Post "1-n · posts"');
    expect(output).toContain(
      '"FK Post.authorId -> User.id · onDelete: set null · onUpdate: cascade"',
    );
    expect(output).toContain('tags "OneToMany"');
    expect(output).toContain('tags "OneToMany,SelfReferential"');
    expect(output).toContain(
      '"many-to-many via an implicit join table (columns not modeled)"',
    );
    expect(output).toContain('tags "ManyToMany"');
  });

  describe("nameMode", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "User",
          tableName: "users",
          fields: [
            {
              name: "fullName",
              columnName: "full_name",
              type: "string",
              nativeType: "TEXT",
            },
          ],
        },
      ],
      relations: [],
    };

    it("uses the physical table/column name under 'table', keying properties by physical column name", () => {
      const output = structurizrEmitter.emit(model, {
        typeMode: "canonical",
        nameMode: "table",
      });

      expect(output).toContain('User = element "users"');
      expect(output).toContain('"column.full_name"');
      expect(output).not.toContain('"model" "User"');
    });

    it("adds a `model` property with the ORM name and a column alias under 'both'", () => {
      const output = structurizrEmitter.emit(model, {
        typeMode: "canonical",
        nameMode: "both",
      });

      expect(output).toContain('"model" "User"');
      expect(output).toContain("alias: fullName");
    });
  });

  describe("caseMode", () => {
    it("case-transforms display identifiers (entity name, column key) but never type labels, enum values, index names, or the DSL variable", () => {
      const model: ERDModel = {
        entities: [
          {
            name: "PostTag",
            fields: [
              {
                name: "tagId",
                type: "enum",
                nativeType: "PostTagStatus",
                enumValues: ["Active", "Archived"],
              },
            ],
            indexes: [{ fields: ["tagId"], name: "idx_PostTag_tagId" }],
          },
        ],
        relations: [],
      };

      const output = structurizrEmitter.emit(model, {
        typeMode: "canonical",
        caseMode: "snake",
      });

      // Display identifiers respect caseMode.
      expect(output).toContain('element "post_tag"');
      expect(output).toContain('"column.tag_id"');
      // Enum member values and the enum's native type are never transformed.
      expect(output).toContain("enum(Active, Archived)");
      // Index names aren't entity/field/enum-type identifiers — left as-is,
      // matching DBML's `name:` handling.
      expect(output).toContain('"index.idx_PostTag_tagId"');
      // The internal `x = element` DSL variable is derived straight from
      // the raw model name — it's a reference token, never displayed, so
      // caseMode doesn't touch it either.
      expect(output).toContain('PostTag = element "post_tag"');
    });
  });

  it("always includes the static views/styles block", () => {
    const model: ERDModel = { entities: [], relations: [] };

    const output = structurizrEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain('custom "ERD" "ERD"');
    expect(output).toContain("autoLayout lr");
    expect(output).toContain('element "Entity" {');
    expect(output).toContain('relationship "OneToOne" {');
  });
});
