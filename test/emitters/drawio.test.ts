import { describe, it, expect } from "vitest";
import { drawioEmitter } from "../../src/emitters/drawio";
import type { ERDModel, Relation } from "../../src/core/model";

const userPostModel = (rel: Relation): ERDModel => ({
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
      ],
    },
    {
      name: "Post",
      fields: [
        {
          name: "id",
          type: "int",
          nativeType: "INTEGER",
          isPrimaryKey: true,
          isNullable: false,
        },
        {
          name: "userId",
          columnName: "user_id",
          type: "int",
          nativeType: "INTEGER",
          isForeignKey: true,
          isNullable: false,
        },
      ],
    },
  ],
  relations: [rel],
});

describe("drawioEmitter", () => {
  it("emits the mandatory mxfile/root boilerplate cells", () => {
    const output = drawioEmitter.emit(
      { entities: [], relations: [] },
      { typeMode: "canonical" },
    );

    expect(output).toContain('<mxfile host="app.diagrams.net">');
    expect(output).toContain('<mxCell id="0" />');
    expect(output).toContain('<mxCell id="1" parent="0" />');
    expect(output.trimEnd().endsWith("</mxfile>")).toBe(true);
  });

  it("sizes the table height as startSize + rowCount * rowHeight", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "User",
          fields: [
            { name: "id", type: "int", nativeType: "INTEGER" },
            { name: "email", type: "string", nativeType: "STRING" },
            { name: "bio", type: "string", nativeType: "STRING" },
          ],
        },
      ],
      relations: [],
    };

    const output = drawioEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain('value="User" style="shape=table;startSize=30;');
    expect(output).toContain('x="40" y="40" width="200" height="120"');
  });

  it("lays rows out below the header band, first row only carrying bottom=1", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "User",
          fields: [
            { name: "id", type: "int", nativeType: "INTEGER" },
            { name: "email", type: "string", nativeType: "STRING" },
          ],
        },
      ],
      relations: [],
    };

    const output = drawioEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain(
      '<mxCell id="e0_r0" style="shape=partialRectangle',
    );
    expect(output).toMatch(/id="e0_r0" style="[^"]*bottom=1;"/);
    expect(output).toMatch(/id="e0_r1" style="[^"]*bottom=0;"/);
    expect(output).toContain('<mxGeometry y="30" width="200" height="30"');
    expect(output).toContain('<mxGeometry y="60" width="200" height="30"');
    // Key cell is a fixed 30px column, the name cell takes the rest.
    expect(output).toContain('<mxGeometry width="30" height="30"');
    expect(output).toContain('<mxGeometry x="30" width="170" height="30"');
  });

  it("renders type/nullability/unique as free text in the name cell", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "User",
          fields: [
            {
              name: "email",
              type: "string",
              nativeType: "VARCHAR",
              isUnique: true,
              isNullable: false,
            },
            {
              name: "bio",
              type: "string",
              nativeType: "TEXT",
              isNullable: true,
            },
            {
              name: "role",
              type: "enum",
              nativeType: "ENUM",
              enumValues: ["admin", "user"],
              defaultValue: "user",
              isNullable: false,
            },
          ],
        },
      ],
      relations: [],
    };

    const output = drawioEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain('value="email STRING NOT NULL UNIQUE"');
    expect(output).toContain('value="bio STRING NULL"');
    expect(output).toContain(
      'value="role ENUM NOT NULL [admin|user] DEFAULT user"',
    );
  });

  it("uses native type names in native mode", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "User",
          fields: [
            {
              name: "email",
              type: "string",
              nativeType: "varchar(255)",
              isNullable: false,
            },
          ],
        },
      ],
      relations: [],
    };

    expect(drawioEmitter.emit(model, { typeMode: "native" })).toContain(
      'value="email VARCHAR(255) NOT NULL"',
    );
  });

  it("numbers FK markers per entity and combines them with PK", () => {
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
            },
            {
              name: "tagId",
              type: "int",
              nativeType: "INTEGER",
              isPrimaryKey: true,
              isForeignKey: true,
            },
            {
              name: "addedById",
              type: "int",
              nativeType: "INTEGER",
              isForeignKey: true,
            },
          ],
        },
      ],
      relations: [],
    };

    const output = drawioEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain('id="e0_r0_key" value="PK, FK1"');
    expect(output).toContain('id="e0_r1_key" value="PK, FK2"');
    expect(output).toContain('id="e0_r2_key" value="FK3"');
  });

  it("bolds the PK marker and bold-underlines the PK name cell, plain for the rest", () => {
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
              isForeignKey: true,
            },
          ],
        },
      ],
      relations: [],
    };

    const output = drawioEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toMatch(/id="e0_r0_key"[^\n]*fontStyle=1;/);
    expect(output).toMatch(/id="e0_r0_name"[^\n]*fontStyle=5;/);
    // FK rows get no font emphasis at all — the "FK1" text carries it.
    expect(output).not.toMatch(/id="e0_r1_key"[^\n]*fontStyle/);
    expect(output).not.toMatch(/id="e0_r1_name"[^\n]*fontStyle/);
  });

  it("appends composite uniques and indexes as marker-less trailing rows", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "User",
          uniques: [["tenantId", "email"]],
          indexes: [
            { fields: ["email"], name: "user_email_idx" },
            { fields: ["tenantId"], isUnique: true },
          ],
          fields: [
            { name: "tenantId", type: "int", nativeType: "INTEGER" },
            { name: "email", type: "string", nativeType: "STRING" },
          ],
        },
      ],
      relations: [],
    };

    const output = drawioEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain(
      'id="e0_r2_name" value="UNIQUE (tenantId, email)"',
    );
    expect(output).toContain(
      'id="e0_r3_name" value="INDEX user_email_idx (email)"',
    );
    expect(output).toContain('id="e0_r4_name" value="UNIQUE INDEX (tenantId)"');
    // Table height still counts every row, constraint rows included.
    expect(output).toContain('height="180" as="geometry"');
  });

  it("anchors an edge to the referenced and FK row cells", () => {
    const output = drawioEmitter.emit(
      userPostModel({
        from: "User",
        to: "Post",
        type: "1-n",
        fieldName: "author",
        fromColumn: "id",
        toColumn: "userId",
      }),
      { typeMode: "canonical" },
    );

    expect(output).toContain('source="e0_r0" target="e1_r1"');
    expect(output).toContain('value="author (userId)"');
    expect(output).toContain("edgeStyle=entityRelationEdgeStyle;html=1;");
    expect(output).toContain('<mxPoint x="0" y="0" as="sourcePoint" />');
  });

  it("maps every relation type/optionality combination to its ER markers", () => {
    const markers = (rel: Relation) => {
      const output = drawioEmitter.emit(userPostModel(rel), {
        typeMode: "canonical",
      });
      return output
        .match(/startArrow=(\w+);startFill=0;endArrow=(\w+)/)!
        .slice(1);
    };
    const base = { from: "User", to: "Post" } as const;

    expect(markers({ ...base, type: "1-1" })).toEqual([
      "ERmandOne",
      "ERzeroToOne",
    ]);
    expect(markers({ ...base, type: "1-1", isFromOptional: true })).toEqual([
      "ERzeroToOne",
      "ERzeroToOne",
    ]);
    expect(markers({ ...base, type: "1-n" })).toEqual([
      "ERmandOne",
      "ERzeroToMany",
    ]);
    expect(markers({ ...base, type: "1-n", isFromOptional: true })).toEqual([
      "ERzeroToOne",
      "ERzeroToMany",
    ]);
    expect(markers({ ...base, type: "n-n" })).toEqual([
      "ERzeroToMany",
      "ERzeroToMany",
    ]);
  });

  it("anchors a self-relation to two rows of the same table", () => {
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
              name: "referredById",
              type: "int",
              nativeType: "INTEGER",
              isForeignKey: true,
              isNullable: true,
            },
          ],
        },
      ],
      relations: [
        {
          from: "User",
          to: "User",
          type: "1-n",
          fromColumn: "id",
          toColumn: "referredById",
          isFromOptional: true,
        },
      ],
    };

    expect(drawioEmitter.emit(model, { typeMode: "canonical" })).toContain(
      'source="e0_r0" target="e0_r1"',
    );
  });

  it("falls back to the table cell when an entity has no rows to anchor to", () => {
    const model: ERDModel = {
      entities: [
        { name: "User", fields: [] },
        { name: "Post", fields: [] },
      ],
      relations: [{ from: "User", to: "Post", type: "1-n" }],
    };

    expect(drawioEmitter.emit(model, { typeMode: "canonical" })).toContain(
      'source="e0" target="e1"',
    );
  });

  it("drops a relation whose endpoint entity isn't in the model", () => {
    const model: ERDModel = {
      entities: [{ name: "User", fields: [] }],
      relations: [{ from: "User", to: "Ghost", type: "1-n" }],
    };

    expect(drawioEmitter.emit(model, { typeMode: "canonical" })).not.toContain(
      '<mxCell id="rel0"',
    );
  });

  it("XML-escapes text without double-escaping ampersands", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "R&D <Team>",
          fields: [
            {
              name: "note",
              type: "string",
              nativeType: "STRING",
              description: 'say "hi" & <bye>',
            },
          ],
        },
      ],
      relations: [],
    };

    const output = drawioEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain('value="R&amp;D &lt;Team&gt;"');
    expect(output).toContain("say &quot;hi&quot; &amp; &lt;bye&gt;");
    expect(output).not.toContain("&amp;amp;");
  });

  it("grids entities into columns instead of stacking them all at one origin", () => {
    const model: ERDModel = {
      entities: Array.from({ length: 4 }, (_, i) => ({
        name: `E${i}`,
        fields: [{ name: "id", type: "int" as const, nativeType: "INTEGER" }],
      })),
      relations: [],
    };

    const output = drawioEmitter.emit(model, { typeMode: "canonical" });

    // 4 entities -> 2 columns; 200 wide + 80 gap, 60 tall + 60 gap.
    expect(output).toContain('id="e0" value="E0"');
    expect(output).toContain('x="40" y="40" width="200" height="60"');
    expect(output).toContain('x="320" y="40" width="200" height="60"');
    expect(output).toContain('x="40" y="160" width="200" height="60"');
    expect(output).toContain('x="320" y="160" width="200" height="60"');
  });

  it("widens a table so its longest row text isn't clipped by overflow=hidden", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "User",
          fields: [
            {
              name: "a_very_long_column_name_that_needs_more_room",
              type: "string",
              nativeType: "STRING",
              isNullable: false,
            },
          ],
        },
      ],
      relations: [],
    };

    const output = drawioEmitter.emit(model, { typeMode: "canonical" });
    const width = Number(output.match(/width="(\d+)" height="60"/)![1]);

    expect(width).toBeGreaterThan(200);
  });

  it("renders physical names under --names table and both", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "User",
          tableName: "users",
          fields: [
            {
              name: "displayName",
              columnName: "display_name",
              type: "string",
              nativeType: "STRING",
              isNullable: false,
            },
          ],
        },
      ],
      relations: [],
    };

    const table = drawioEmitter.emit(model, {
      typeMode: "canonical",
      nameMode: "table",
    });
    expect(table).toContain('value="users"');
    expect(table).toContain('value="display_name STRING NOT NULL"');

    const both = drawioEmitter.emit(model, {
      typeMode: "canonical",
      nameMode: "both",
    });
    expect(both).toContain('value="users (User)"');
    expect(both).toContain(
      'value="display_name STRING NOT NULL (displayName)"',
    );
  });

  it("applies --case and --inflect to identifiers", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "PostTag",
          fields: [
            {
              name: "postId",
              type: "int",
              nativeType: "INTEGER",
              isNullable: false,
            },
          ],
        },
      ],
      relations: [],
    };

    const output = drawioEmitter.emit(model, {
      typeMode: "canonical",
      caseMode: "snake",
      inflectMode: "plural",
    });

    expect(output).toContain('value="post_tags"');
    expect(output).toContain('value="post_id INT NOT NULL"');
  });

  it("resolves relation endpoints by model field name, not column name", () => {
    const output = drawioEmitter.emit(
      userPostModel({
        from: "User",
        to: "Post",
        type: "1-n",
        fromColumn: "id",
        toColumn: "userId",
      }),
      { typeMode: "canonical", nameMode: "table" },
    );

    expect(output).toContain('value="user_id INT NOT NULL"');
    expect(output).toContain('source="e0_r0" target="e1_r1"');
  });
});
