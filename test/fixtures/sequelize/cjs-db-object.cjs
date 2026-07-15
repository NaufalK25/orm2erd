"use strict";
// Mirrors sequelize-cli's generated models/index.js convention: the
// instance is a property of the exported `db` object, not a named export.
const sequelize = {
  models: {
    User: {
      name: "User",
      rawAttributes: {
        id: { type: { constructor: { name: "INTEGER" } }, primaryKey: true },
      },
      associations: {},
    },
  },
  define: () => {},
};

module.exports = { sequelize, Sequelize: {} };
