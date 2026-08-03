import { describe, it, expect } from "vitest";
import { mermaidEmitter } from "../../src/emitters/mermaid";
import type { ERDModel } from "../../src/core/model";

describe("mermaidEmitter", () => {
  it("renders entities with field types, constraints, and annotations", () => {
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
            },
            {
              name: "email",
              type: "string",
              nativeType: "STRING",
              isUnique: true,
            },
            {
              name: "role",
              type: "enum",
              nativeType: "ENUM",
              enumValues: ["admin", "member"],
              defaultValue: "member",
            },
          ],
        },
      ],
      relations: [],
    };

    const output = mermaidEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("erDiagram");
    expect(output).toContain("User {");
    expect(output).toContain("int id PK");
    expect(output).toContain("string email UK");
    expect(output).toContain(
      'enum role "enum: admin, member | default: member"',
    );
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

    const output = mermaidEmitter.emit(model, { typeMode: "native" });

    expect(output).toContain("INTEGER id");
  });

  it("escapes embedded double quotes in a default value instead of breaking the quoted comment", () => {
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
            },
          ],
        },
      ],
      relations: [],
    };

    const output = mermaidEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain(`default: {'january':'','february':''}"`);
  });

  it("renders each relation type with the correct crow's-foot notation", () => {
    const model: ERDModel = {
      entities: [],
      relations: [
        { from: "User", to: "Profile", type: "1-1", fieldName: "profile" },
        { from: "User", to: "Post", type: "1-n", fieldName: "posts" },
        { from: "Post", to: "Tag", type: "n-n", fieldName: "tags" },
      ],
    };

    const output = mermaidEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain('User ||--o| Profile : "profile"');
    expect(output).toContain('User ||--o{ Post : "posts"');
    expect(output).toContain('Post }o--o{ Tag : "tags"');
  });

  it("downgrades the `from` marker to optional when isFromOptional is set", () => {
    const model: ERDModel = {
      entities: [],
      relations: [
        {
          from: "User",
          to: "Profile",
          type: "1-1",
          isFromOptional: true,
        },
        {
          from: "User",
          to: "Post",
          type: "1-n",
          isFromOptional: true,
        },
      ],
    };

    const output = mermaidEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain('User |o--o| Profile : ""');
    expect(output).toContain('User |o--o{ Post : ""');
  });

  it("marks nullable and list fields with the right suffixes", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "Post",
          fields: [
            {
              name: "title",
              type: "string",
              nativeType: "STRING",
              isNullable: true,
            },
            {
              name: "tags",
              type: "string",
              nativeType: "STRING",
              isList: true,
            },
          ],
        },
      ],
      relations: [],
    };

    const output = mermaidEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("string? title");
    expect(output).toContain("string[] tags");
  });

  it("renders field descriptions in the trailing comment slot and entity descriptions as a %% line", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "User",
          description: "Registered application users.",
          fields: [
            {
              name: "name",
              type: "string",
              nativeType: "STRING",
              description: "The user's display name.",
            },
          ],
        },
      ],
      relations: [],
    };

    const output = mermaidEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("%% Registered application users.");
    expect(output).toContain(`string name "The user's display name."`);
  });

  it("disambiguates two same-alias relations between the same entity pair with the FK column (#2)", () => {
    const model: ERDModel = {
      entities: [],
      relations: [
        {
          from: "User",
          to: "Post",
          type: "1-n",
          fieldName: "posts",
          toColumn: "authorId",
        },
        {
          from: "User",
          to: "Post",
          type: "1-n",
          fieldName: "posts",
          toColumn: "editorId",
        },
      ],
    };

    const output = mermaidEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain('User ||--o{ Post : "posts (authorId)"');
    expect(output).toContain('User ||--o{ Post : "posts (editorId)"');
  });

  it("marks composite-unique members UK and notes their group mates (#4a)", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "PostTag",
          fields: [
            { name: "tagId", type: "int", nativeType: "INTEGER" },
            { name: "addedBy", type: "string", nativeType: "STRING" },
          ],
          uniques: [["tagId", "addedBy"]],
        },
      ],
      relations: [],
    };

    const output = mermaidEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain('int tagId UK "unique with: addedBy"');
    expect(output).toContain('string addedBy UK "unique with: tagId"');
  });

  describe("nameMode", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "User",
          tableName: "users",
          fields: [
            { name: "id", type: "int", nativeType: "INTEGER" },
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
          fieldName: "posts",
        },
      ],
    };

    it("defaults to model names when nameMode is omitted", () => {
      const output = mermaidEmitter.emit(model, { typeMode: "canonical" });
      expect(output).toContain("User {");
      expect(output).toContain("string fullName");
      expect(output).toContain('User ||--o{ Post : "posts"');
    });

    it("uses physical table/column names under 'table'", () => {
      const output = mermaidEmitter.emit(model, {
        typeMode: "canonical",
        nameMode: "table",
      });
      expect(output).toContain("users {");
      expect(output).toContain("string full_name");
      expect(output).toContain("int author_id");
      expect(output).toContain('users ||--o{ posts : "posts"');
    });

    it("renders the physical name as an entity alias under 'both'", () => {
      const output = mermaidEmitter.emit(model, {
        typeMode: "canonical",
        nameMode: "both",
      });
      expect(output).toContain('users["User"] {');
      expect(output).toContain('string full_name "alias: fullName"');
    });
  });

  describe("relationLabelMode", () => {
    const model: ERDModel = {
      entities: [],
      relations: [
        {
          from: "User",
          to: "Post",
          type: "1-n",
          fieldName: "posts",
          toColumn: "authorId",
        },
      ],
    };

    it("pins the label to the alias only", () => {
      const output = mermaidEmitter.emit(model, {
        typeMode: "canonical",
        relationLabelMode: "alias",
      });
      expect(output).toContain('User ||--o{ Post : "posts"');
    });

    it("pins the label to the FK column only", () => {
      const output = mermaidEmitter.emit(model, {
        typeMode: "canonical",
        relationLabelMode: "column",
      });
      expect(output).toContain('User ||--o{ Post : "authorId"');
    });
  });
});
