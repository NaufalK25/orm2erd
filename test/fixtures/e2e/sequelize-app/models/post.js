export default function definePost(sequelize, DataTypes) {
  const Post = sequelize.define("Post", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    title: { type: DataTypes.STRING, allowNull: false },
    status: {
      type: DataTypes.ENUM("draft", "published"),
      defaultValue: "draft",
    },
    authorId: { type: DataTypes.INTEGER, allowNull: false },
  });

  Post.associate = (models) => {
    Post.belongsTo(models.User, {
      foreignKey: "authorId",
      as: "author",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    Post.hasMany(models.PostTag, { foreignKey: "postId", as: "tagLinks" });
    // Convenience many-to-many over the explicit junction model — the two
    // hasMany/belongsTo pairs to PostTag above already convey this m-n, so
    // orm2erd's adapter dedupes the derived n-n edge in favor of those.
    Post.belongsToMany(models.Tag, {
      through: models.PostTag,
      foreignKey: "postId",
      otherKey: "tagId",
      as: "tags",
    });
  };

  return Post;
}
