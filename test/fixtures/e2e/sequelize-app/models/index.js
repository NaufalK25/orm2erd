// Mirrors sequelize-cli's generated models/index.js aggregator, minus the
// filesystem auto-discovery (explicit imports instead, for a fixture this
// small) — builds a real `Sequelize` instance against an in-memory sqlite
// store (never actually queried; orm2erd only reads schema metadata).
import { Sequelize, DataTypes } from "sequelize";
import defineUser from "./user.js";
import definePost from "./post.js";
import defineTag from "./tag.js";
import definePostTag from "./post-tag.js";

export const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: ":memory:",
  logging: false,
});

const models = {
  User: defineUser(sequelize, DataTypes),
  Post: definePost(sequelize, DataTypes),
  Tag: defineTag(sequelize, DataTypes),
  PostTag: definePostTag(sequelize, DataTypes),
};

for (const model of Object.values(models)) {
  model.associate(models);
}
