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

    const output = d2Emitter.emit(model, { typeMode: "native" });

    expect(output).toContain('"id":  "INTEGER NOT NULL"');
  });

  it("appends [] to a list field's type label", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "Post",
          fields: [
            {
              name: "labels",
              type: "string",
              nativeType: "TEXT",
              isList: true,
            },
          ],
        },
      ],
      relations: [],
    };

    const output = d2Emitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("string[]");
  });

  it("marks a foreign-key field {constraint:fk}, and combines multiple constraints into a bracketed list", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "Post",
          fields: [
            {
              name: "authorId",
              type: "int",
              nativeType: "INTEGER",
              isForeignKey: true,
              isUnique: true,
            },
          ],
        },
      ],
      relations: [],
    };

    const output = d2Emitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("{constraint:[fk,unique]}");
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

    expect(output).toContain('"Profile"."userId" <-> "User"."id": id {');
    expect(output).toContain('"User"."id" <-> "Post"."authorId": authorId {');
    expect(output).toContain('"Post"."id" <-> "Tag"."id": id {');

    const oneToOne = output.split(
      '"Profile"."userId" <-> "User"."id": id {',
    )[1];
    expect(oneToOne).toContain("source-arrowhead.shape: cf-one-required\n");
    expect(oneToOne).toContain("target-arrowhead.shape: cf-one\n");

    const oneToMany = output.split(
      '"User"."id" <-> "Post"."authorId": authorId {',
    )[1];
    expect(oneToMany).toContain("source-arrowhead.shape: cf-one-required\n");
    expect(oneToMany).toContain("target-arrowhead.shape: cf-many\n");

    const manyToMany = output.split('"Post"."id" <-> "Tag"."id": id {')[1];
    expect(manyToMany).toContain("source-arrowhead.shape: cf-many\n");
    expect(manyToMany).toContain("target-arrowhead.shape: cf-many\n");
  });

  it("downgrades source-arrowhead to plain cf-one when isFromOptional is set", () => {
    const model: ERDModel = {
      entities: [],
      relations: [
        {
          from: "Profile",
          to: "User",
          type: "1-1",
          fromColumn: "userId",
          toColumn: "id",
          isFromOptional: true,
        },
        {
          from: "User",
          to: "Post",
          type: "1-n",
          fromColumn: "id",
          toColumn: "authorId",
          isFromOptional: true,
        },
      ],
    };

    const output = d2Emitter.emit(model, { typeMode: "canonical" });

    const oneToOne = output.split(
      '"Profile"."userId" <-> "User"."id": id {',
    )[1];
    expect(oneToOne).toContain("source-arrowhead.shape: cf-one\n");

    const oneToMany = output.split(
      '"User"."id" <-> "Post"."authorId": authorId {',
    )[1];
    expect(oneToMany).toContain("source-arrowhead.shape: cf-one\n");
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
    expect(output).toContain('"User"."id" <-> "Post"."authorId": authorId {');
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
          fromColumn: "id",
          toColumn: "authorId",
        },
        {
          from: "User",
          to: "Post",
          type: "1-n",
          fieldName: "posts",
          fromColumn: "id",
          toColumn: "editorId",
        },
      ],
    };

    const output = d2Emitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain(
      '"User"."id" <-> "Post"."authorId": posts (authorId) {',
    );
    expect(output).toContain(
      '"User"."id" <-> "Post"."editorId": posts (editorId) {',
    );
  });

  it("marks composite-unique members {constraint:unique} and notes their group mates (#4a)", () => {
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

    const output = d2Emitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain(
      '  "tagId":  "int NOT NULL unique with: addedBy" {constraint:unique}',
    );
    expect(output).toContain(
      '  "addedBy":  "string NOT NULL unique with: tagId" {constraint:unique}',
    );
  });
});
