// sequelize-cli-style per-model factory: takes the shared `sequelize`
// instance + `DataTypes`, defines the model, and attaches `associate` for
// the aggregator (index.js) to call once every model is defined.
export default function defineUser(sequelize, DataTypes) {
  const User = sequelize.define(
    "User",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      email: { type: DataTypes.STRING, allowNull: false, unique: true },
      name: { type: DataTypes.STRING },
    },
    { comment: "Registered application users." },
  );

  User.associate = (models) => {
    User.hasMany(models.Post, { foreignKey: "authorId", as: "posts" });
  };

  return User;
}
