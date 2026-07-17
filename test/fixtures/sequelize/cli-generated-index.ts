// Mirrors sequelize-cli's generated models/index.js, ported to TS: mixes
// CJS globals into real ESM import/export syntax. tsImport always compiles
// .ts to ESM, where __filename/__dirname/require don't otherwise exist
// (regression: "__dirname is not defined in ES module scope").
const basename = require("path").basename(__filename);
void basename;
void __dirname;

export const sequelize = {
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
