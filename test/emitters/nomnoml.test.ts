import { describe, it, expect } from "vitest";
import { nomnomlEmitter } from "../../src/emitters/nomnoml";
import type { ERDModel } from "../../src/core/model";

describe("nomnomlEmitter", () => {
  it("renders entities as <table> nodes with field types, constraints, and defaults", () => {
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

    const output = nomnomlEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("#direction: right");
    expect(output).toContain("[<table> User|");
    expect(output).toContain("  id | int PK, NN ||");
    expect(output).toContain("  email | string unique, NN ||");
    expect(output).toContain("  bio | string ||");
    expect(output).toContain("  isActive | boolean NN = true");
  });

  it("marks a field with no explicit isNullable as NOT NULL, same as an explicit false", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "Config",
          fields: [{ name: "key", type: "string", nativeType: "STRING" }],
        },
      ],
      relations: [],
    };

    const output = nomnomlEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("  key | string NN");
  });

  it("only emits the || row divider between fields, never after the last one", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "Order",
          fields: [
            {
              name: "id",
              type: "int",
              nativeType: "INTEGER",
              isPrimaryKey: true,
              isNullable: false,
            },
            {
              name: "status",
              type: "enum",
              nativeType: "ENUM",
              enumValues: ["pending", "paid"],
              isNullable: true,
            },
            {
              name: "total",
              type: "decimal",
              nativeType: "DECIMAL",
              defaultValue: "0.00",
              isNullable: false,
            },
          ],
        },
      ],
      relations: [],
    };

    const output = nomnomlEmitter.emit(model, { typeMode: "canonical" });
    const entityBlock = output.split("[<table> Order|")[1].split("]")[0];
    const fieldLines = entityBlock
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    expect(fieldLines).toHaveLength(3);
    expect(fieldLines[0].endsWith("||")).toBe(true);
    expect(fieldLines[1].endsWith("||")).toBe(true);
    expect(fieldLines[2].endsWith("||")).toBe(false);
    expect(fieldLines[2]).toBe("total | decimal NN = 0.00");
  });

  it("always uses the native type for enum fields, even in canonical mode", () => {
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

    const output = nomnomlEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("status | enum(draft, published) NN");
  });

  it("escapes embedded double quotes in a default value", () => {
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

    const output = nomnomlEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("= {'january':'','february':''}");
  });

  it("escapes list-field brackets instead of emitting raw nomnoml-reserved characters", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "Profile",
          fields: [
            {
              name: "tags",
              type: "string",
              nativeType: "STRING",
              isList: true,
              isNullable: true,
            },
          ],
        },
      ],
      relations: [],
    };

    const output = nomnomlEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("tags | string\\[\\]");
    expect(output).not.toContain("string[]");
  });

  it("renders each relation type with the correct nomnoml multiplicity notation", () => {
    const model: ERDModel = {
      entities: [],
      relations: [
        { from: "User", to: "Profile", type: "1-1" },
        { from: "User", to: "Post", type: "1-n" },
        { from: "Post", to: "Tag", type: "n-n" },
      ],
    };

    const output = nomnomlEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("[User] 1 -- 1 [Profile]");
    expect(output).toContain("[User] 1 -- * [Post]");
    expect(output).toContain("[Post] * -- * [Tag]");
  });
});
