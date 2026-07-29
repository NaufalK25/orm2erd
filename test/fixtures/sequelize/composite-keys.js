function dataType(name, values) {
  return { constructor: { name }, values };
}

// A join model with a composite primary key (@@id-style, via
// primaryKeyAttributes) and a multi-column unique index (options.indexes).
export const sequelize = {
  models: {
    PostTag: {
      name: "PostTag",
      primaryKeyAttributes: ["postId", "tagId"],
      options: {
        indexes: [
          // Field entries come as bare strings or { name } objects — cover both.
          { unique: true, fields: ["tagId", { name: "addedBy" }] },
          // Single-column unique index: already on the field, must be ignored.
          { unique: true, fields: ["slug"] },
          // Non-unique composite index: not a unique constraint, carried as
          // a plain Index instead.
          { fields: ["postId", "addedBy"], name: "post_addedby_idx" },
          // Non-unique single-column index, deliberately left unnamed to
          // test the no-name path. A real `sequelize.define()`/`Model.init()`
          // call would auto-name this (Utils.nameIndex in sequelize's own
          // lib/utils.js, e.g. "post_tags_addedby") — this hand-mocked
          // fixture bypasses that normalization, so `name` stays undefined.
          { fields: ["addedBy"] },
        ],
      },
      rawAttributes: {
        postId: { type: dataType("INTEGER"), primaryKey: true },
        tagId: { type: dataType("INTEGER"), primaryKey: true },
        addedBy: { type: dataType("STRING"), allowNull: false },
        slug: { type: dataType("STRING"), unique: true },
      },
      associations: {},
    },
    // The `unique: 'groupName'` shorthand — real Sequelize's Model.init()
    // groups these into `model.uniqueKeys`, never `options.indexes` (#4b).
    // `uniqueKeys` is keyed by physical column name (`post_ref`/`author_ref`),
    // which differs from the attribute name here to also exercise the
    // column->attribute mapping.
    Comment: {
      name: "Comment",
      primaryKeyAttributes: ["id"],
      uniqueKeys: {
        grp: { fields: ["post_ref", "author_ref"], name: "grp" },
        // A single-column group (the plain `unique: true` shorthand also
        // lands here in real Sequelize) — must stay off `entity.uniques`
        // and only set the field's own `isUnique`.
        comment_permalink_unique: {
          fields: ["permalink"],
          name: "comment_permalink_unique",
        },
      },
      options: {},
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        postId: { type: dataType("STRING"), unique: "grp", field: "post_ref" },
        authorId: {
          type: dataType("STRING"),
          unique: "grp",
          field: "author_ref",
        },
        permalink: { type: dataType("STRING"), unique: true },
      },
      associations: {},
    },
  },
  define: () => {},
};
