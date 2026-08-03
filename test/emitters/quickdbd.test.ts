import { describe, it, expect } from "vitest";
import { quickdbdEmitter } from "../../src/emitters/quickdbd";
import type { ERDModel } from "../../src/core/model";

describe("quickdbdEmitter", () => {
  it("renders entities with field types, constraints, and defaults", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "User",
          fields: [
            {
              name: "id",
              type: "int",
              nativeType: "INTEGER",
              isPrimaryKey: true,
              isNullable: false,
            },
            {
              name: "email",
              type: "string",
              nativeType: "STRING",
              isUnique: true,
            },
            {
              name: "isActive",
              type: "boolean",
              nativeType: "BOOLEAN",
              defaultValue: "true",
              isNullable: false,
            },
          ],
        },
      ],
      relations: [],
    };

    const output = quickdbdEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("User");
    expect(output).toContain("--");
    expect(output).toContain("id int PK");
    expect(output).toContain("email string UNIQUE");
    expect(output).toContain("isActive boolean # default: true");
  });

  it("uses the ORM-native type name when typeMode is 'native'", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "User",
          fields: [{ name: "id", type: "int", nativeType: "INTEGER" }],
        },
      ],
      relations: [],
    };

    const output = quickdbdEmitter.emit(model, { typeMode: "native" });

    expect(output).toContain("id INTEGER");
  });

  it("marks nullable fields with NULL", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "User",
          fields: [
            {
              name: "bio",
              type: "string",
              nativeType: "STRING",
              isNullable: true,
            },
          ],
        },
      ],
      relations: [],
    };

    const output = quickdbdEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("bio string NULL");
  });

  it("renders enum fields as the literal Enum type with values listed in a trailing comment", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "Post",
          fields: [
            {
              name: "status",
              type: "enum",
              nativeType: "enum_Post_status",
              enumValues: ["draft", "published"],
            },
          ],
        },
      ],
      relations: [],
    };

    const output = quickdbdEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("status Enum # enum: draft, published");
  });

  it("orders the enum comment before the default comment when a field has both", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "Post",
          fields: [
            {
              name: "status",
              type: "enum",
              nativeType: "enum_Post_status",
              enumValues: ["draft", "published"],
              defaultValue: "draft",
            },
          ],
        },
      ],
      relations: [],
    };

    const output = quickdbdEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain(
      "status Enum # enum: draft, published | default: draft",
    );
  });

  it("marks list fields with a [] suffix", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "Profile",
          fields: [
            {
              name: "avatarFallback",
              type: "string",
              nativeType: "STRING",
              isList: true,
              isNullable: false,
            },
          ],
        },
      ],
      relations: [],
    };

    const output = quickdbdEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("avatarFallback string[]");
  });

  it("renders the FK column inline with the correct direction symbol and target", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "Profile",
          fields: [
            {
              name: "userId",
              type: "int",
              nativeType: "INTEGER",
              isUnique: true,
            },
          ],
        },
        {
          name: "Post",
          fields: [{ name: "authorId", type: "int", nativeType: "INTEGER" }],
        },
      ],
      relations: [
        {
          from: "User",
          to: "Profile",
          type: "1-1",
          fromColumn: "id",
          toColumn: "userId",
        },
        {
          from: "User",
          to: "Post",
          type: "1-n",
          fromColumn: "id",
          toColumn: "authorId",
        },
      ],
    };

    const output = quickdbdEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("userId int UNIQUE FK - User.id");
    expect(output).toContain("authorId int FK >- User.id");
  });

  it("falls back to a bare FK token when a foreign-key field has no resolvable relation column", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "Comment",
          fields: [
            {
              name: "postId",
              type: "int",
              nativeType: "INTEGER",
              isForeignKey: true,
            },
          ],
        },
      ],
      relations: [{ from: "Post", to: "Tag", type: "n-n" }],
    };

    const output = quickdbdEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("postId int FK");
    expect(output).not.toContain("postId int FK -");
    expect(output).not.toContain("postId int FK >-");
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
              nativeType: "STRING",
            },
          ],
        },
        {
          name: "Post",
          tableName: "posts",
          fields: [
            {
              name: "authorId",
              columnName: "author_id",
              type: "int",
              nativeType: "INTEGER",
              isForeignKey: true,
            },
          ],
        },
      ],
      relations: [
        {
          from: "User",
          to: "Post",
          type: "1-n",
          fromColumn: "id",
          toColumn: "authorId",
        },
      ],
    };

    it("uses physical table/column names under 'table', including the inline FK reference", () => {
      const output = quickdbdEmitter.emit(model, {
        typeMode: "canonical",
        nameMode: "table",
      });
      expect(output).toContain("users\n--");
      expect(output).toContain("full_name string");
      expect(output).toContain("author_id int FK >- users.id");
    });

    it("has no entity alias syntax, but notes the field alias under 'both'", () => {
      const output = quickdbdEmitter.emit(model, {
        typeMode: "canonical",
        nameMode: "both",
      });
      expect(output).toContain("users\n--");
      expect(output).toContain("full_name string # alias: fullName");
    });
  });
});
