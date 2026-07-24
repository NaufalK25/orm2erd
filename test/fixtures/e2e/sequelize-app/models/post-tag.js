// Explicit junction model for Post<->Tag — a composite primary key over its
// two FK columns, same shape as a real sequelize-cli "join table" migration.
export default function definePostTag(sequelize, DataTypes) {
  const PostTag = sequelize.define("PostTag", {
    postId: { type: DataTypes.INTEGER, primaryKey: true },
    tagId: { type: DataTypes.INTEGER, primaryKey: true },
  });

  PostTag.associate = (models) => {
    PostTag.belongsTo(models.Post, { foreignKey: "postId" });
    PostTag.belongsTo(models.Tag, { foreignKey: "tagId" });
  };

  return PostTag;
}
