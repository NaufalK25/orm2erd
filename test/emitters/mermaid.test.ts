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

  it("escapes embedded double quotes in a default value instead of breaking the quoted comment", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "Config",
          fields: [
            {
              name: "monthlyOverride",
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

    expect(output).toContain('User ||--|| Profile : "profile"');
    expect(output).toContain('User ||--o{ Post : "posts"');
    expect(output).toContain('Post }o--o{ Tag : "tags"');
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
});
