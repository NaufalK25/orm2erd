import { describe, it, expect } from "vitest";
import { excalidrawEmitter } from "../../src/emitters/excalidraw";
import type { ERDModel, Relation } from "../../src/core/model";

interface Element {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  frameId: string | null;
  name?: string;
  text?: string;
  backgroundColor?: string;
  boundElements?: { id: string; type: string }[] | null;
  points?: [number, number][];
  startBinding?: { elementId: string; fixedPoint: [number, number] };
  endBinding?: { elementId: string; fixedPoint: [number, number] };
  startArrowhead?: string;
  endArrowhead?: string;
}

const parse = (output: string): { elements: Element[] } => JSON.parse(output);

const emit = (model: ERDModel) =>
  parse(excalidrawEmitter.emit(model, { typeMode: "canonical" }));

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

const oneToMany: Relation = {
  from: "User",
  to: "Post",
  type: "1-n",
  fieldName: "posts",
  fromColumn: "id",
  toColumn: "userId",
};

const entity = (name: string) => ({
  name,
  fields: [
    {
      name: "id",
      type: "int" as const,
      nativeType: "INTEGER",
      isPrimaryKey: true,
    },
  ],
});

describe("excalidrawEmitter", () => {
  it("emits the documented file skeleton as valid JSON", () => {
    const output = excalidrawEmitter.emit(
      { entities: [], relations: [] },
      { typeMode: "canonical" },
    );
    const doc = JSON.parse(output);

    expect(doc.type).toBe("excalidraw");
    expect(doc.version).toBe(2);
    expect(doc.elements).toEqual([]);
    expect(doc.appState).toEqual({
      gridSize: 20,
      viewBackgroundColor: "#ffffff",
    });
    expect(doc.files).toEqual({});
  });

  it("renders one frame per entity, named for the entity, sized by row count", () => {
    const { elements } = emit(userPostModel(oneToMany));
    const frames = elements.filter((e) => e.type === "frame");

    expect(frames.map((f) => f.name)).toEqual(["User", "Post"]);
    // The frame label floats above the frame, so height is rows * 30 with no
    // header band consuming internal space.
    expect(frames[0].height).toBe(30);
    expect(frames[1].height).toBe(60);
  });

  it("places each row rectangle at an absolute offset inside its frame", () => {
    const { elements } = emit(userPostModel(oneToMany));
    const post = elements.find((e) => e.id === "e1")!;
    const rows = elements.filter(
      (e) => e.type === "rectangle" && e.frameId === "e1",
    );

    expect(rows).toHaveLength(2);
    // Absolute coordinates, never parent-relative — frame offset included.
    expect(rows[0].y).toBe(post.y);
    expect(rows[1].y).toBe(post.y + 30);
    expect(rows.every((r) => r.x === post.x)).toBe(true);
  });

  it("marks PK/FK rows with marker text and fills PK rows for emphasis", () => {
    const { elements } = emit(userPostModel(oneToMany));
    const markers = elements.filter((e) => e.id.endsWith("_key"));

    expect(markers.map((m) => m.text)).toEqual(["PK", "PK", "FK1"]);
    expect(elements.find((e) => e.id === "e1_r0")!.backgroundColor).toBe(
      "#e9ecef",
    );
    expect(elements.find((e) => e.id === "e1_r1")!.backgroundColor).toBe(
      "transparent",
    );
  });

  it("binds arrows to row rectangles and keeps boundElements in sync both ways", () => {
    const model = userPostModel(oneToMany);
    model.relations.push({
      from: "User",
      to: "Post",
      type: "1-1",
      fieldName: "pinnedPost",
      fromColumn: "id",
      toColumn: "id",
      isFromOptional: true,
    });
    const { elements } = emit(model);
    const byId = new Map(elements.map((e) => [e.id, e]));
    const arrows = elements.filter((e) => e.type === "arrow");

    expect(arrows).toHaveLength(2);
    // boundElements is the reciprocal half of start/endBinding and is not
    // reconstructed on load — an arrow whose target forgot it silently
    // detaches the moment the shape is dragged in the app.
    for (const arrow of arrows) {
      for (const endpoint of [arrow.startBinding!, arrow.endBinding!]) {
        const shape = byId.get(endpoint.elementId);
        expect(shape?.type).toBe("rectangle");
        expect(shape!.boundElements).toContainEqual({
          id: arrow.id,
          type: "arrow",
        });
      }
    }
    // ...and nothing claims a binding it wasn't given.
    const arrowIds = new Set(arrows.map((a) => a.id));
    for (const element of elements) {
      for (const bound of element.boundElements ?? []) {
        expect(arrowIds.has(bound.id)).toBe(true);
        const arrow = byId.get(bound.id)!;
        expect([
          arrow.startBinding!.elementId,
          arrow.endBinding!.elementId,
        ]).toContain(element.id);
      }
    }
  });

  it("gives every element a unique id", () => {
    const { elements } = emit(userPostModel(oneToMany));
    const ids = elements.map((e) => e.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("anchors each end on the relation's own columns", () => {
    const { elements } = emit(userPostModel(oneToMany));
    const arrow = elements.find((e) => e.type === "arrow")!;

    expect(arrow.startBinding!.elementId).toBe("e0_r0"); // User.id
    expect(arrow.endBinding!.elementId).toBe("e1_r1"); // Post.userId
  });

  it("maps relation cardinality onto the cardinality_* arrowheads", () => {
    const heads = (rel: Relation) => {
      const arrow = emit(userPostModel(rel)).elements.find(
        (e) => e.type === "arrow",
      )!;
      return [arrow.startArrowhead, arrow.endArrowhead];
    };

    expect(heads(oneToMany)).toEqual([
      "cardinality_exactly_one",
      "cardinality_zero_or_many",
    ]);
    expect(heads({ ...oneToMany, isFromOptional: true })).toEqual([
      "cardinality_zero_or_one",
      "cardinality_zero_or_many",
    ]);
    expect(heads({ ...oneToMany, type: "1-1" })).toEqual([
      "cardinality_exactly_one",
      "cardinality_zero_or_one",
    ]);
    expect(heads({ ...oneToMany, type: "n-n" })).toEqual([
      "cardinality_zero_or_many",
      "cardinality_zero_or_many",
    ]);
  });

  it("faces the arrow at the edges nearest its target, sign carried by points", () => {
    const forward = emit(userPostModel(oneToMany)).elements.find(
      (e) => e.type === "arrow",
    )!;
    // Post sits right of User in the grid: exit right, enter left.
    expect(forward.startBinding!.fixedPoint).toEqual([1, 0.5]);
    expect(forward.endBinding!.fixedPoint).toEqual([0, 0.5]);
    expect(forward.points![1][0]).toBeGreaterThan(0);

    // Reverse the direction and the edges flip rather than looping backward.
    const backward = emit(
      userPostModel({
        from: "Post",
        to: "User",
        type: "1-n",
        fieldName: "users",
        fromColumn: "id",
        toColumn: "id",
      }),
    ).elements.find((e) => e.type === "arrow")!;

    expect(backward.startBinding!.fixedPoint).toEqual([0, 0.5]);
    expect(backward.endBinding!.fixedPoint).toEqual([1, 0.5]);
    const [dx] = backward.points![1];
    expect(dx).toBeLessThan(0);
    // width/height are magnitudes; only `points` may go negative.
    expect(backward.width).toBe(Math.abs(dx));
    expect(backward.height).toBeGreaterThanOrEqual(0);
  });

  it("uses the top/bottom edges when the grid wraps the target onto a new row", () => {
    // 4 entities → a 2x2 grid, so User (cell 0,0) sits directly above Tag
    // (cell 1,0): the dominant displacement is vertical, not horizontal.

    const { elements } = emit({
      entities: ["User", "Post", "Tag", "PostTag"].map(entity),
      relations: [
        { from: "User", to: "Tag", type: "1-n", fieldName: "tags" },
        { from: "Tag", to: "User", type: "1-n", fieldName: "users" },
      ],
    });
    const [down, up] = elements.filter((e) => e.type === "arrow");

    expect(down.startBinding!.fixedPoint).toEqual([0.5, 1]); // exits User's bottom
    expect(down.endBinding!.fixedPoint).toEqual([0.5, 0]); //   enters Tag's top
    expect(down.points![1][1]).toBeGreaterThan(0);

    expect(up.startBinding!.fixedPoint).toEqual([0.5, 0]);
    expect(up.endBinding!.fixedPoint).toEqual([0.5, 1]);
    const [, dy] = up.points![1];
    expect(dy).toBeLessThan(0);
    expect(up.height).toBe(Math.abs(dy));
  });

  it("renders the relation label as a free-floating text element", () => {
    const { elements } = emit(userPostModel(oneToMany));
    const label = elements.find((e) => e.id === "rel0_label")!;

    expect(label.type).toBe("text");
    expect(label.text).toBe("posts (userId)");
    expect(label.frameId).toBeNull();
  });

  it("carries composite uniques and indexes as extra marker-less rows", () => {
    const { elements } = emit({
      entities: [
        {
          name: "Tag",
          fields: [
            { name: "id", type: "int", nativeType: "INTEGER" },
            { name: "slug", type: "string", nativeType: "STRING" },
          ],
          uniques: [["id", "slug"]],
          indexes: [{ fields: ["slug"], name: "tag_slug_idx" }],
        },
      ],
      relations: [],
    });
    const texts = elements
      .filter((e) => e.id.endsWith("_name"))
      .map((e) => e.text);

    expect(texts).toContain("UNIQUE (id, slug)");
    expect(texts).toContain("INDEX tag_slug_idx (slug)");
    expect(elements.find((e) => e.type === "frame")!.height).toBe(120);
  });

  it("is byte-identical across runs so --check sees no drift", () => {
    const model = userPostModel(oneToMany);

    expect(excalidrawEmitter.emit(model, { typeMode: "canonical" })).toBe(
      excalidrawEmitter.emit(model, { typeMode: "canonical" }),
    );
  });
});
