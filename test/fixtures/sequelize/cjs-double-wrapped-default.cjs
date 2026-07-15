"use strict";
// Mirrors a TS file compiled with "module": "commonjs" using
// `export default sequelize`: Node's ESM/CJS interop wraps the whole
// exports object as mod.default, putting the real instance at
// mod.default.default instead of mod.default directly.
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = {
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
