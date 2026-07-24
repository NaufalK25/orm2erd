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

  it("emits exactly one -- separator after a composite primary key", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "OrderItem",
          fields: [
            {
              name: "orderId",
              type: "int",
              nativeType: "INTEGER",
              isPrimaryKey: true,
              isForeignKey: true,
            },
            {
              name: "productId",
              type: "int",
              nativeType: "INTEGER",
              isPrimaryKey: true,
              isForeignKey: true,
            },
            {
              name: "qty",
              type: "int",
              nativeType: "INTEGER",
            },
          ],
        },
      ],
      relations: [],
    };

    const output = plantumlEmitter.emit(model, { typeMode: "canonical" });
    const entityBlock = output.split("entity OrderItem {")[1].split("}")[0];

    expect(entityBlock).toContain("* orderId : int <<FK>>");
    expect(entityBlock).toContain("* productId : int <<FK>>");
    expect((entityBlock.match(/--/g) ?? []).length).toBe(1);
  });

  it("omits the -- separator when an entity has no primary key or no other fields", () => {
    const noPk: ERDModel = {
      entities: [
        {
          name: "Log",
          fields: [{ name: "message", type: "string", nativeType: "STRING" }],
        },
      ],
      relations: [],
    };
    const onlyPk: ERDModel = {
      entities: [
        {
          name: "Flag",
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

    expect(output).toContain('User ||--|| Profile : "profile"');
    expect(output).toContain('User ||--o{ Post : "posts"');
    expect(output).toContain('Post }o--o{ Tag : "tags"');
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
});
