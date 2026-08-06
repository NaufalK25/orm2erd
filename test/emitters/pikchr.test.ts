import { describe, it, expect } from "vitest";
import { pikchrEmitter } from "../../src/emitters/pikchr";
import type { ERDModel } from "../../src/core/model";

describe("pikchrEmitter", () => {
  it("renders an entity as a field container plus a background box", () => {
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

    const output = pikchrEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("UserFields: [");
    expect(output).toContain('text "User" bold big');
    expect(output).toContain('text "Registered platform users." italic small');
    expect(output).toMatch(
      /text "PK\s+id\s+int\s+NOT NULL \(SERIAL\)" mono small/,
    );
    expect(output).toMatch(
      /text "UQ\s+email\s+string\s+NOT NULL \(VARCHAR\(255\)\)" mono small/,
    );
    expect(output).toMatch(/text "\s+bio\s+string\s+NULL \(TEXT\)" mono small/);
    expect(output).toContain(
      "User: box fill entityFill behind UserFields at UserFields.center width UserFields.width+0.3in height UserFields.height+0.3in",
    );
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

    const output = pikchrEmitter.emit(model, { typeMode: "native" });

    expect(output).toContain('text "id SERIAL NOT NULL" mono small');
    expect(output).not.toContain("(SERIAL)");
  });

  it("shows the bare word 'enum' in the type cell and appends member values as a bracket suffix; appends [] for list fields", () => {
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

    const output = pikchrEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain(
      "status enum     NOT NULL DEFAULT 'draft' (post_status) [draft|published]",
    );
    expect(output).toContain("tags   string[] NULL (TEXT[])");
  });

  it("only emits composite PK/unique/index lines for multi-column groups, not single-column ones", () => {
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

    const output = pikchrEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain(
      'text "PK (orderId, productId)" italic mono small',
    );
    expect(output).toContain(
      'text "UNIQUE (orderId, productId)" italic mono small',
    );
    expect(output).toContain(
      'text "INDEX idx_order_items_order (orderId)" italic mono small',
    );
    // Single-column PK entity gets no composite PK line — the field-level
    // "PK" marker on its own field row already says so.
    expect(output).not.toMatch(/text "PK \(id\)"/);
  });

  it("renders an unnamed plain/unique index without fabricating a name", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "Shop",
          fields: [
            { name: "ownerId", type: "int", nativeType: "INTEGER" },
            { name: "region", type: "string", nativeType: "TEXT" },
          ],
          indexes: [
            { fields: ["ownerId"], isUnique: true },
            { fields: ["region"] },
          ],
        },
      ],
      relations: [],
    };

    const output = pikchrEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain('text "UNIQUE INDEX (ownerId)" italic mono small');
    expect(output).toContain('text "INDEX (region)" italic mono small');
  });

  it("sanitizes object identifiers with a capital initial and dedupes collisions in the shared box/Fields namespace", () => {
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

    const output = pikchrEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("ModelFields: [");
    expect(output).toContain("Model: box fill entityFill behind ModelFields");
    expect(output).toContain("Post_TagFields: [");
    expect(output).toContain("arrow from Model.");
    expect(output).toContain("to Post_Tag.");
  });

  it("connects relations to background boxes with FK details in the below-arrow label", () => {
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
        },
      ],
    };

    const output = pikchrEmitter.emit(model, {
      typeMode: "canonical",
      relationLabelMode: "alias",
    });

    expect(output).toContain("arrow from User.");
    expect(output).toContain("to Post.");
    expect(output).toContain("color oneToManyColor");
    expect(output).toContain('"1-n · posts" above');
    expect(output).toContain(
      '"FK Post.authorId -> User.id · onDelete: set null · onUpdate: cascade" below small italic',
    );
  });

  it("routes a self-referential relation through a bent path, never a straight line to itself", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "Category",
          fields: [{ name: "parentId", type: "int", nativeType: "INTEGER" }],
        },
      ],
      relations: [
        {
          from: "Category",
          to: "Category",
          type: "1-n",
          fieldName: "subcategories",
          fromColumn: "id",
          toColumn: "parentId",
        },
      ],
    };

    const output = pikchrEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toMatch(
      /arrow from Category\.e then right 0\.4in then up [\d.]+in then to Category\.n/,
    );
  });

  it("routes a second relation between the same entity pair on a distinct bent path instead of overlapping the first", () => {
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
      ],
      relations: [
        {
          from: "User",
          to: "Post",
          type: "1-n",
          fieldName: "posts",
          fromColumn: "id",
          toColumn: "authorId",
        },
        {
          from: "User",
          to: "Post",
          type: "1-n",
          fieldName: "editedPosts",
          fromColumn: "id",
          toColumn: "editorId",
        },
      ],
    };

    const output = pikchrEmitter.emit(model, { typeMode: "canonical" });
    const arrows = output
      .split("\n")
      .filter((line) => line.startsWith("arrow from"));

    expect(arrows).toHaveLength(2);
    expect(arrows[0]).toContain("from User.e to Post.w");
    expect(arrows[1]).not.toContain("from User.e to Post.w");
    expect(arrows[1]).toContain("until even with Post.");
  });

  it("dashes an unresolved (implicit many-to-many) relation and uses the manyToMany color", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "Post",
          fields: [{ name: "id", type: "int", nativeType: "SERIAL" }],
        },
        {
          name: "Category",
          fields: [{ name: "id", type: "int", nativeType: "SERIAL" }],
        },
      ],
      relations: [{ from: "Post", to: "Category", type: "n-n" }],
    };

    const output = pikchrEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toMatch(
      /arrow from Post\..* to Category\..* dashed color manyToManyColor/,
    );
    expect(output).toContain(
      '"many-to-many via an implicit join table (columns not modeled)" below',
    );
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

    it("uses the physical table/column name under 'table', with no '(model: ...)' line", () => {
      const output = pikchrEmitter.emit(model, {
        typeMode: "canonical",
        nameMode: "table",
      });

      expect(output).toContain('text "users" bold big');
      expect(output).toContain("full_name");
      expect(output).not.toContain("(model:");
    });

    it("adds a '(model: ...)' line and a field alias under 'both'", () => {
      const output = pikchrEmitter.emit(model, {
        typeMode: "canonical",
        nameMode: "both",
      });

      expect(output).toContain('text "(model: User)" italic small');
      expect(output).toContain("alias: fullName");
    });
  });

  describe("caseMode", () => {
    it("case-transforms display identifiers but never type labels, enum values, or index names", () => {
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

      const output = pikchrEmitter.emit(model, {
        typeMode: "canonical",
        caseMode: "snake",
      });

      expect(output).toContain('text "post_tag" bold big');
      expect(output).toContain("tag_id");
      expect(output).toContain("[Active|Archived]");
      expect(output).toContain("idx_PostTag_tagId");
    });
  });

  it("renders only the color/fill variable declarations for an empty model, with no entities or arrows", () => {
    const model: ERDModel = { entities: [], relations: [] };

    const output = pikchrEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("oneToOneColor = 0x2E7D32");
    expect(output).toContain("oneToManyColor = 0x1565C0");
    expect(output).toContain("manyToManyColor = 0xAD1457");
    expect(output).toContain("entityFill = 0xF5F5F5");
    expect(output).not.toContain("arrow from");
    expect(output).not.toContain("Fields: [");
  });
});
