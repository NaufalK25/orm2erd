"use strict";
// Mirrors `export default Todo` where Todo is a Model class returned from
// sequelize.define() — the instance lives on the class's static
// `.sequelize` back-reference, not the export itself.
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

function User() {}
User.sequelize = sequelize;

module.exports = User;
