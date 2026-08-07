import { describe, it, expect } from "vitest";
import { erEmitter } from "../../src/emitters/er";
import type { ERDModel, Relation } from "../../src/core/model";

const baseModel = (rel: Relation): ERDModel => ({
  entities: [
    { name: "User", fields: [] },
    { name: "Post", fields: [] },
  ],
  relations: [rel],
});

describe("erEmitter", () => {
  it("renders entities with PK/FK prefixes and a type+nullability label", () => {
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
              isNullable: false,
            },
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

    const output = erEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("[User]");
    expect(output).toContain('*id {label: "int, not null"}');
    expect(output).toContain('email {label: "string, not null | unique"}');
    expect(output).toContain('bio {label: "string, null"}');
  });

  it("renders a composite PK+FK member with both prefixes", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "PostTag",
          primaryKey: ["postId", "tagId"],
          fields: [
            {
              name: "postId",
              type: "int",
              nativeType: "INTEGER",
              isPrimaryKey: true,
              isForeignKey: true,
              isNullable: false,
            },
            {
              name: "tagId",
              type: "int",
              nativeType: "INTEGER",
              isPrimaryKey: true,
              isForeignKey: true,
              isNullable: false,
            },
          ],
        },
      ],
      relations: [],
    };

    const output = erEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain('*+postId {label: "int, not null"}');
    expect(output).toContain('*+tagId {label: "int, not null"}');
  });

  it('uses the native type in native mode, and always "Enum" for enum fields regardless of typeMode', () => {
    const model: ERDModel = {
      entities: [
        {
          name: "Post",
          fields: [
            {
              name: "body",
              type: "string",
              nativeType: "TEXT",
              isNullable: true,
            },
            {
              name: "status",
              type: "enum",
              nativeType: "enum_Post_status",
              enumValues: ["draft", "published"],
              isNullable: false,
            },
          ],
        },
      ],
      relations: [],
    };

    const nativeOutput = erEmitter.emit(model, { typeMode: "native" });
    expect(nativeOutput).toContain('body {label: "TEXT, null"}');
    expect(nativeOutput).toContain(
      'status {label: "Enum, not null | enum: draft, published"}',
    );

    const canonicalOutput = erEmitter.emit(model, { typeMode: "canonical" });
    expect(canonicalOutput).toContain(
      'status {label: "Enum, not null | enum: draft, published"}',
    );
  });

  it("backtick-quotes entity/field names that don't match a bare identifier, leaves plain ones bare", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "Post Tag",
          fields: [
            {
              name: "post-id",
              type: "int",
              nativeType: "INTEGER",
              isNullable: false,
            },
            {
              name: "name",
              type: "string",
              nativeType: "STRING",
              isNullable: false,
            },
          ],
        },
      ],
      relations: [],
    };

    const output = erEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("[`Post Tag`]");
    expect(output).toContain("`post-id` {label:");
    expect(output).toContain("name {label:");
    expect(output).not.toContain("`name`");
  });

  it("escapes embedded double quotes in a default value instead of breaking the quoted label", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "Profile",
          fields: [
            {
              name: "preferences",
              type: "json",
              nativeType: "JSONB",
              defaultValue: '{"january":"","february":""}',
              isNullable: true,
            },
          ],
        },
      ],
      relations: [],
    };

    const output = erEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain(`default: {'january':'','february':''}`);
  });

  describe("nameMode", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "User",
          tableName: "users",
          fields: [
            {
              name: "id",
              columnName: "user_id",
              type: "int",
              nativeType: "INTEGER",
              isPrimaryKey: true,
              isNullable: false,
            },
          ],
        },
      ],
      relations: [],
    };

    it("renders physical table/column names in table mode", () => {
      const output = erEmitter.emit(model, {
        typeMode: "canonical",
        nameMode: "table",
      });
      expect(output).toContain("[users]");
      expect(output).toContain("*user_id {label:");
    });

    it("adds an alias in the label in both mode", () => {
      const output = erEmitter.emit(model, {
        typeMode: "canonical",
        nameMode: "both",
      });
      expect(output).toContain('[users] {label: "alias: User"}');
      expect(output).toContain('*user_id {label: "int, not null | alias: id"}');
    });
  });

  describe("cardinality token mapping", () => {
    it("1-1, FK not nullable: to=? from=1", () => {
      const output = erEmitter.emit(
        baseModel({ from: "User", to: "Post", type: "1-1" }),
        { typeMode: "canonical" },
      );
      expect(output).toContain("Post ?--1 User");
    });

    it("1-1, FK nullable: to=? from=?", () => {
      const output = erEmitter.emit(
        baseModel({
          from: "User",
          to: "Post",
          type: "1-1",
          isFromOptional: true,
        }),
        { typeMode: "canonical" },
      );
      expect(output).toContain("Post ?--? User");
    });

    it("1-n, FK not nullable: to=* from=1", () => {
      const output = erEmitter.emit(
        baseModel({ from: "User", to: "Post", type: "1-n" }),
        { typeMode: "canonical" },
      );
      expect(output).toContain("Post *--1 User");
    });

    it("1-n, FK nullable: to=* from=?", () => {
      const output = erEmitter.emit(
        baseModel({
          from: "User",
          to: "Post",
          type: "1-n",
          isFromOptional: true,
        }),
        { typeMode: "canonical" },
      );
      expect(output).toContain("Post *--? User");
    });

    it("n-n (isFromOptional never set): to=* from=*", () => {
      const output = erEmitter.emit(
        baseModel({ from: "User", to: "Post", type: "n-n" }),
        { typeMode: "canonical" },
      );
      expect(output).toContain("Post *--* User");
    });

    it("renders a self-relationship without special-casing", () => {
      const output = erEmitter.emit(
        baseModel({
          from: "User",
          to: "User",
          type: "1-n",
          isFromOptional: true,
        }),
        { typeMode: "canonical" },
      );
      expect(output).toContain("User *--? User");
    });
  });

  describe("relationLabelMode", () => {
    const model: ERDModel = {
      entities: [
        { name: "User", fields: [] },
        { name: "Post", fields: [] },
      ],
      relations: [
        {
          from: "User",
          to: "Post",
          type: "1-n",
          fieldName: "author",
          toColumn: "authorId",
        },
      ],
    };

    it("alias mode uses only fieldName", () => {
      const output = erEmitter.emit(model, {
        typeMode: "canonical",
        relationLabelMode: "alias",
      });
      expect(output).toContain('{label: "author"}');
    });

    it("column mode uses only toColumn", () => {
      const output = erEmitter.emit(model, {
        typeMode: "canonical",
        relationLabelMode: "column",
      });
      expect(output).toContain('{label: "authorId"}');
    });

    it("both mode (default) combines alias and column", () => {
      const output = erEmitter.emit(model, { typeMode: "canonical" });
      expect(output).toContain('{label: "author (authorId)"}');
    });
  });
});
