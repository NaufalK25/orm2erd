import { describe, it, expect } from "vitest";
import { plantumlEmitter } from "../../src/emitters/plantuml";
import type { ERDModel } from "../../src/core/model";

describe("plantumlEmitter", () => {
  it("wraps output in @startuml/@enduml with the crow's-foot skin params", () => {
    const model: ERDModel = { entities: [], relations: [] };

    const output = plantumlEmitter.emit(model, { typeMode: "canonical" });

    expect(output.startsWith("@startuml\n")).toBe(true);
    expect(output).toContain("hide circle");
    expect(output).toContain("skinparam linetype ortho");
    expect(output.trim().endsWith("@enduml")).toBe(true);
  });

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

    const output = plantumlEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("entity User {");
    expect(output).toContain("* id : int");
    expect(output).toContain("* email : string <<unique>>");
    expect(output).toContain("* role : enum(admin, member)");
    expect(output).toContain("= member");
    expect(output).toContain("bio : string");
    expect(output).not.toContain("* bio");
    expect(output).not.toContain("string?");
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

    const output = plantumlEmitter.emit(model, { typeMode: "native" });

    expect(output).toContain("id : INTEGER");
  });

  it("emits exactly one -- separator after a composite primary key", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "PostTag",
          fields: [
            {
              name: "postId",
              type: "int",
              nativeType: "INTEGER",
              isPrimaryKey: true,
              isForeignKey: true,
            },
            {
              name: "tagId",
              type: "int",
              nativeType: "INTEGER",
              isPrimaryKey: true,
              isForeignKey: true,
            },
            {
              name: "priority",
              type: "int",
              nativeType: "INTEGER",
            },
          ],
        },
      ],
      relations: [],
    };

    const output = plantumlEmitter.emit(model, { typeMode: "canonical" });
    const entityBlock = output.split("entity PostTag {")[1].split("}")[0];

    expect(entityBlock).toContain("* postId : int <<FK>>");
    expect(entityBlock).toContain("* tagId : int <<FK>>");
    expect((entityBlock.match(/--/g) ?? []).length).toBe(1);
  });

  it("omits the -- separator when an entity has no primary key or no other fields", () => {
    const noPk: ERDModel = {
      entities: [
        {
          name: "Comment",
          fields: [{ name: "body", type: "string", nativeType: "STRING" }],
        },
      ],
      relations: [],
    };
    const onlyPk: ERDModel = {
      entities: [
        {
          name: "Post",
          fields: [
            {
              name: "id",
              type: "int",
              nativeType: "INTEGER",
              isPrimaryKey: true,
            },
          ],
        },
      ],
      relations: [],
    };

    expect(plantumlEmitter.emit(noPk, { typeMode: "canonical" })).not.toContain(
      "--",
    );
    expect(
      plantumlEmitter.emit(onlyPk, { typeMode: "canonical" }),
    ).not.toContain("--");
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

    const output = plantumlEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain('User ||--o| Profile : "profile"');
    expect(output).toContain('User ||--o{ Post : "posts"');
    expect(output).toContain('Post }o--o{ Tag : "tags"');
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

    const output = plantumlEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain('User ||--o{ Post : "posts (authorId)"');
    expect(output).toContain('User ||--o{ Post : "posts (editorId)"');
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
        { from: "User", to: "Post", type: "1-n", isFromOptional: true },
      ],
    };

    const output = plantumlEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain('User |o--o| Profile : ""');
    expect(output).toContain('User |o--o{ Post : ""');
  });

  it("marks list fields with a [] suffix", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "Post",
          fields: [
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

    const output = plantumlEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("* tags : string[]");
  });

  it("renders field descriptions inline and entity descriptions as a bottom note", () => {
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

    const output = plantumlEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("-- The user's display name.");
    expect(output).toContain(
      "note bottom of User : Registered application users.",
    );
  });

  it("does not use an alias, referencing entities by their bare name", () => {
    const model: ERDModel = {
      entities: [
        { name: "User", fields: [] },
        { name: "Post", fields: [] },
      ],
      relations: [{ from: "User", to: "Post", type: "1-n" }],
    };

    const output = plantumlEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("entity User {");
    expect(output).not.toContain(" as ");
    expect(output).toContain("User ||--o{ Post");
  });

  it("marks composite-unique members <<unique>> and notes their group mates (#4a)", () => {
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

    const output = plantumlEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("tagId : int <<unique>>, -- unique with: addedBy");
    expect(output).toContain(
      "addedBy : string <<unique>>, -- unique with: tagId",
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
              nativeType: "STRING",
            },
          ],
        },
      ],
      relations: [],
    };

    it("uses physical table/column names under 'table'", () => {
      const output = plantumlEmitter.emit(model, {
        typeMode: "canonical",
        nameMode: "table",
      });
      expect(output).toContain("entity users {");
      expect(output).toContain("full_name : string");
    });

    it("renders the physical name as an entity alias under 'both'", () => {
      const output = plantumlEmitter.emit(model, {
        typeMode: "canonical",
        nameMode: "both",
      });
      expect(output).toContain('entity users as "User" {');
      expect(output).toContain("-- alias: fullName");
    });
  });

  describe("quoting a multi-word entity name", () => {
    // PlantUML tolerates a bare hyphen/space on a *field* name, and even
    // tolerates a bare hyphen on the entity's own `entity X {` declaration
    // — but not when that same entity name is referenced from a
    // relationship line, and never a bare space anywhere. Quote the entity
    // name consistently everywhere it appears rather than relying on that
    // inconsistent per-position leniency.
    const model: ERDModel = {
      entities: [
        {
          name: "User",
          tableName: "users",
          fields: [{ name: "id", type: "int", nativeType: "INTEGER" }],
        },
        {
          name: "PostTag",
          tableName: "post_tag",
          fields: [
            {
              name: "addedAt",
              columnName: "added_at",
              type: "datetime",
              nativeType: "DATETIME",
            },
          ],
        },
      ],
      relations: [
        { from: "User", to: "PostTag", type: "1-n", fieldName: "postTags" },
      ],
    };

    it("quotes the entity (declaration + relationship reference) under kebab, but never a field", () => {
      const output = plantumlEmitter.emit(model, {
        typeMode: "canonical",
        nameMode: "table",
        caseMode: "kebab",
      });
      expect(output).toContain('entity "post-tag" {');
      expect(output).toContain("added-at : datetime");
      expect(output).toContain('users ||--o{ "post-tag" : "post-tags"');
    });

    it("quotes the entity under title, but never a field", () => {
      const output = plantumlEmitter.emit(model, {
        typeMode: "canonical",
        nameMode: "table",
        caseMode: "title",
      });
      expect(output).toContain('entity "Post Tag" {');
      expect(output).toContain("Added At : datetime");
      expect(output).toContain('Users ||--o{ "Post Tag" : "Post Tags"');
    });
  });
});
