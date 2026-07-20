function dataType(name, values) {
  return { constructor: { name }, values };
}

// Mirrors Sequelize's sentinel DataTypes (e.g. DataTypes.UUIDV4/NOW): class
// instances with no own properties, used as-is as a defaultValue.
class UUIDV4 {}

// Mirrors Sequelize.literal(...): a raw SQL expression wrapped in a class
// instance with a single `val` property (e.g. a Postgres sequence default).
class Literal {
  constructor(val) {
    this.val = val;
  }
}

export const sequelize = {
  models: {
    User: {
      name: "User",
      rawAttributes: {
        id: {
          type: dataType("INTEGER"),
          primaryKey: true,
          autoIncrement: true,
        },
        name: { type: dataType("STRING"), allowNull: false },
        email: { type: dataType("STRING"), unique: true },
        isActive: { type: dataType("BOOLEAN"), defaultValue: true },
        externalId: { type: dataType("UUID"), defaultValue: new UUIDV4() },
      },
      associations: {
        posts: {
          associationType: "HasMany",
          foreignKey: "userId",
          target: { name: "Post" },
          as: "posts",
        },
      },
    },
    Post: {
      name: "Post",
      rawAttributes: {
        id: {
          type: dataType("INTEGER"),
          primaryKey: true,
          autoIncrement: true,
          defaultValue: new Literal("nextval('posts_id_seq')"),
        },
        title: { type: dataType("STRING"), allowNull: false },
        status: {
          type: dataType("ENUM", ["draft", "published"]),
          defaultValue: "draft",
        },
        userId: { type: dataType("INTEGER") },
      },
      associations: {
        user: {
          associationType: "BelongsTo",
          foreignKey: "userId",
          target: { name: "User" },
          as: "user",
        },
        tags: {
          associationType: "BelongsToMany",
          foreignKey: "postId",
          otherKey: "tagId",
          target: { name: "Tag" },
          as: "tags",
        },
      },
    },
    Tag: {
      name: "Tag",
      rawAttributes: {
        id: {
          type: dataType("INTEGER"),
          primaryKey: true,
          autoIncrement: true,
        },
        name: { type: dataType("STRING"), unique: true },
      },
      associations: {
        posts: {
          associationType: "BelongsToMany",
          foreignKey: "tagId",
          otherKey: "postId",
          target: { name: "Post" },
          as: "posts",
        },
      },
    },
  },
  define: () => {},
};
