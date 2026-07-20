import { describe, it, expect } from "vitest";
import { d2Emitter } from "../../src/emitters/d2";
import type { ERDModel } from "../../src/core/model";

describe("d2Emitter", () => {
  it("renders entities as sql_table shapes with field types, constraints, and defaults", () => {
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

    const output = d2Emitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain('"User": {');
    expect(output).toContain("shape: sql_table");
    expect(output).toContain('  "id":  "int NOT NULL" {constraint:pk}');
    expect(output).toContain(
      '  "email":  "string NOT NULL" {constraint:unique}',
    );
    expect(output).toContain('  "isActive":  "boolean NOT NULL DEFAULT true"');
  });

  it("quotes identifiers that collide with D2 reserved keywords", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "classes",
          fields: [
            {
              name: "shape",
              type: "string",
              nativeType: "STRING",
              isPrimaryKey: true,
            },
          ],
        },
      ],
      relations: [],
    };

    const output = d2Emitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain('"classes": {');
    expect(output).toContain('  "shape": ');
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

    const output = d2Emitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain(`DEFAULT {'january':'','february':''}`);
    expect(output).not.toMatch(/DEFAULT "\{/);
  });

  it("inlines enum values in the field type instead of a separate block", () => {
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

    const output = d2Emitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain('  "status":  "enum(draft, published) NOT NULL"');
  });

  it("renders each relation with crow's-foot arrowhead shapes and its columns", () => {
    const model: ERDModel = {
      entities: [],
      relations: [
        {
          from: "Profile",
          to: "User",
          type: "1-1",
          fromColumn: "userId",
          toColumn: "id",
        },
        {
          from: "User",
          to: "Post",
          type: "1-n",
          fromColumn: "id",
          toColumn: "authorId",
        },
        {
          from: "Post",
          to: "Tag",
          type: "n-n",
          fromColumn: "id",
          toColumn: "id",
        },
      ],
    };

    const output = d2Emitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain('"Profile"."userId" <-> "User"."id" {');
    expect(output).toContain('"User"."id" <-> "Post"."authorId" {');
    expect(output).toContain('"Post"."id" <-> "Tag"."id" {');

    const oneToOne = output.split('"Profile"."userId" <-> "User"."id" {')[1];
    expect(oneToOne).toContain("source-arrowhead.shape: cf-one");
    expect(oneToOne).toContain("target-arrowhead.shape: cf-one");

    const oneToMany = output.split('"User"."id" <-> "Post"."authorId" {')[1];
    expect(oneToMany).toContain("source-arrowhead.shape: cf-one");
    expect(oneToMany).toContain("target-arrowhead.shape: cf-many");

    const manyToMany = output.split('"Post"."id" <-> "Tag"."id" {')[1];
    expect(manyToMany).toContain("source-arrowhead.shape: cf-many");
    expect(manyToMany).toContain("target-arrowhead.shape: cf-many");
  });

  it("skips a relation missing a column on either side instead of emitting a bare table-to-table connection", () => {
    const model: ERDModel = {
      entities: [],
      relations: [
        { from: "Post", to: "Tag", type: "n-n" },
        {
          from: "User",
          to: "Post",
          type: "1-n",
          fromColumn: "id",
          toColumn: "authorId",
        },
      ],
    };

    const output = d2Emitter.emit(model, { typeMode: "canonical" });

    expect(output).not.toContain('"Post" <-> "Tag"');
    expect(output).toContain('"User"."id" <-> "Post"."authorId" {');
  });
});
