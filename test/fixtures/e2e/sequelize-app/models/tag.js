export default function defineTag(sequelize, DataTypes) {
  const Tag = sequelize.define("Tag", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false, unique: true },
  });

  Tag.associate = (models) => {
    Tag.hasMany(models.PostTag, { foreignKey: "tagId", as: "postLinks" });
    Tag.belongsToMany(models.Post, {
      through: models.PostTag,
      foreignKey: "tagId",
      otherKey: "postId",
      as: "posts",
    });
  };

  return Tag;
}
