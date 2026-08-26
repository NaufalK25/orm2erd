function dataType(name, values) {
  return { constructor: { name }, values };
}

// Two BelongsToMany pairs declared through the SAME junction — Post↔Tag and
// Post↔User both `through: PostTag`. belongs-to-many.js writes
// `unique: '<tableName>_<foreignKey>_<otherKey>_unique'` onto both FK
// attributes of each pair, and the second pair's `Object.assign` overwrites
// the first's on the shared `postId`. Real Sequelize 6 leaves exactly the
// `uniqueKeys`/`unique` shape reproduced below: the surviving group keeps two
// fields, while the clobbered group is left with one — `userId` stranded as
// the lone member of a group whose name still says `userId_postId`.
//
// `slug` is the control: a genuine single-column unique, named
// `<tableName>_<column>_unique`, which must keep its UK marker.
export const sequelize = {
  models: {
    Post: {
      name: "Post",
      tableName: "posts",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        title: { type: dataType("STRING"), allowNull: false },
      },
      associations: {
        tags: {
          associationType: "BelongsToMany",
          foreignKey: "postId",
          otherKey: "tagId",
          target: { name: "Tag" },
          as: "tags",
          through: { model: { name: "PostTag" } },
        },
        users: {
          associationType: "BelongsToMany",
          foreignKey: "postId",
          otherKey: "userId",
          target: { name: "User" },
          as: "users",
          through: { model: { name: "PostTag" } },
        },
      },
    },
    Tag: {
      name: "Tag",
      tableName: "tags",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        name: { type: dataType("STRING"), allowNull: false },
      },
      associations: {},
    },
    User: {
      name: "User",
      tableName: "users",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        name: { type: dataType("STRING"), allowNull: false },
      },
      associations: {},
    },
    PostTag: {
      name: "PostTag",
      tableName: "post_tags",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        slug: {
          type: dataType("STRING"),
          unique: "post_tags_slug_unique",
        },
        postId: {
          type: dataType("INTEGER"),
          references: { model: "posts", key: "id" },
          unique: "post_tags_tagId_postId_unique",
        },
        tagId: {
          type: dataType("INTEGER"),
          references: { model: "tags", key: "id" },
          unique: "post_tags_tagId_postId_unique",
        },
        userId: {
          type: dataType("INTEGER"),
          references: { model: "users", key: "id" },
          unique: "post_tags_userId_postId_unique",
        },
      },
      uniqueKeys: {
        post_tags_slug_unique: {
          name: "post_tags_slug_unique",
          fields: ["slug"],
        },
        post_tags_tagId_postId_unique: {
          name: "post_tags_tagId_postId_unique",
          fields: ["postId", "tagId"],
        },
        // Clobbered: named for two columns, left holding one.
        post_tags_userId_postId_unique: {
          name: "post_tags_userId_postId_unique",
          fields: ["userId"],
        },
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
        user: {
          associationType: "BelongsTo",
          foreignKey: "userId",
          target: { name: "User" },
          as: "user",
        },
      },
    },
  },
  define: () => {},
};
