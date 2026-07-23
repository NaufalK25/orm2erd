import { describe, it, expect } from "vitest";
import { graphvizdotEmitter } from "../../src/emitters/graphvizdot";
import type { ERDModel } from "../../src/core/model";

describe("graphvizdotEmitter", () => {
  it("renders entities as HTML-like table nodes with fields, constraints, and defaults", () => {
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
              name: "bio",
              type: "string",
              nativeType: "TEXT",
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

    const output = graphvizdotEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain('"User" [label=<');
    expect(output).toContain(
      '<table border="0" cellborder="1" cellspacing="0" cellpadding="4">',
    );
    expect(output).toContain(
      '<tr><td align="center" colspan="2"><b>User</b></td></tr>',
    );
    expect(output).toContain(
      '<tr><td align="left" port="id"><b>id</b>  <i>int</i></td><td align="left">PK</td></tr>',
    );
    expect(output).toContain(
      '<tr><td align="left" port="email"><b>email</b>  <i>string</i></td><td align="left">UNIQUE</td></tr>',
    );
    expect(output).toContain(
      '<tr><td align="left" port="bio"><b>bio</b>  <i>string</i></td><td align="left">nullable</td></tr>',
    );
    expect(output).toContain(
      '<tr><td align="left" port="isActive"><b>isActive</b>  <i>boolean</i></td><td align="left">= true</td></tr>',
    );
  });

  it("emits the native type name in native type mode", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "User",
          fields: [{ name: "id", type: "int", nativeType: "INTEGER" }],
        },
      ],
      relations: [],
    };

    const output = graphvizdotEmitter.emit(model, { typeMode: "native" });

    expect(output).toContain("<i>INTEGER</i>");
    expect(output).not.toContain("<i>int</i>");
  });

  it("gives every field a port, not only primary/foreign/unique keys", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "Post",
          fields: [
            { name: "id", type: "int", nativeType: "INT", isPrimaryKey: true },
            { name: "title", type: "string", nativeType: "STRING" },
          ],
        },
      ],
      relations: [],
    };

    const output = graphvizdotEmitter.emit(model, { typeMode: "canonical" });

    // `title` is unconstrained but must still carry a port.
    expect(output).toContain('port="title"');
  });

  it("appends [] to list fields", () => {
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
            },
          ],
        },
      ],
      relations: [],
    };

    const output = graphvizdotEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("<i>string[]</i>");
  });

  it("inlines enum values in the field type", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "User",
          fields: [
            {
              name: "role",
              type: "enum",
              nativeType: "enum_User_role",
              enumValues: ["ADMIN", "USER", "GUEST"],
              defaultValue: "USER",
            },
          ],
        },
      ],
      relations: [],
    };

    const output = graphvizdotEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("<i>enum(ADMIN, USER, GUEST)</i>");
    expect(output).toContain('<td align="left">= USER</td>');
  });

  it("quotes node ids that collide with DOT reserved keywords", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "subgraph",
          fields: [
            { name: "id", type: "int", nativeType: "INT", isPrimaryKey: true },
          ],
        },
      ],
      relations: [],
    };

    const output = graphvizdotEmitter.emit(model, { typeMode: "canonical" });

    // Unquoted, `subgraph [label=...]` is a syntax error in DOT.
    expect(output).toContain('"subgraph" [label=<');
  });

  it("HTML-escapes special characters in names, types, and defaults", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "A&B",
          fields: [
            {
              name: "count",
              type: "int",
              nativeType: "Array<int>",
              defaultValue: "count > 0",
            },
          ],
        },
      ],
      relations: [],
    };

    const output = graphvizdotEmitter.emit(model, { typeMode: "native" });

    expect(output).toContain("<b>A&amp;B</b>");
    expect(output).toContain("<i>Array&lt;int&gt;</i>");
    expect(output).toContain("= count &gt; 0");
    // No raw special characters should leak into the label body.
    expect(output).not.toContain("<b>A&B</b>");
    expect(output).not.toContain("Array<int>");
  });

  it("renders each relation type with the matching crow's-foot arrows and ported columns", () => {
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

    const output = graphvizdotEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain(
      '"Profile":"userId" -> "User":"id" [arrowhead=teetee, arrowtail=teetee, dir=both, label="1-1"];',
    );
    expect(output).toContain(
      '"User":"id" -> "Post":"authorId" [arrowhead=crow, arrowtail=tee, dir=both, label="1-n"];',
    );
    expect(output).toContain(
      '"Post":"id" -> "Tag":"id" [arrowhead=none, arrowtail=crow, dir=both];',
    );
  });

  it("skips a relation missing a column on either side instead of anchoring to whole nodes", () => {
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

    const output = graphvizdotEmitter.emit(model, { typeMode: "canonical" });

    // The Post→Tag n-n has no resolvable columns; Tag appears nowhere.
    expect(output).not.toContain('"Tag"');
    expect(output).toContain('"User":"id" -> "Post":"authorId"');
  });
});
