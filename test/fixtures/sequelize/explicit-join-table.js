function dataType(name, values) {
  return { constructor: { name }, values };
}

// Mirrors the common Sequelize pattern where a junction is an explicit,
// registered model: each side declares hasMany/belongsTo TO the junction
// *and* a convenience belongsToMany OVER it (through: JunctionModel). The
// belongsToMany's `.through.model.name` matches the junction's key in
// `.models`, so the derived n-n should be suppressed in favor of the two
// 1-n edges to the junction.
export const sequelize = {
  models: {
    Post: {
      name: "Post",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        title: { type: dataType("STRING"), allowNull: false },
      },
      associations: {
        tagLinks: {
          associationType: "HasMany",
          foreignKey: "postId",
          target: { name: "PostTag" },
          as: "tagLinks",
        },
        tags: {
          associationType: "BelongsToMany",
          foreignKey: "postId",
          otherKey: "tagId",
          target: { name: "Tag" },
          as: "tags",
          through: { model: { name: "PostTag" } },
        },
      },
    },
    Tag: {
      name: "Tag",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        name: { type: dataType("STRING"), allowNull: false },
      },
      associations: {
        postLinks: {
          associationType: "HasMany",
          foreignKey: "tagId",
          target: { name: "PostTag" },
          as: "postLinks",
        },
        posts: {
          associationType: "BelongsToMany",
          foreignKey: "tagId",
          otherKey: "postId",
          target: { name: "Post" },
          as: "posts",
          through: { model: { name: "PostTag" } },
        },
      },
    },
    PostTag: {
      name: "PostTag",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        postId: { type: dataType("INTEGER") },
        tagId: { type: dataType("INTEGER") },
      },
      associations: {
        post: {
          associationType: "BelongsTo",
          foreignKey: "postId",
          target: { name: "Post" },
          as: "post",
        },
        tag: {
          associationType: "BelongsTo",
          foreignKey: "tagId",
          target: { name: "Tag" },
          as: "tag",
        },
      },
    },
  },
  define: () => {},
};
