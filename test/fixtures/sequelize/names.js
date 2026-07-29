function dataType(name) {
  return { constructor: { name } };
}

// Mirrors what Model.init() computes under `tableName: "tbl_customer"` +
// `underscored: true`: `tableName` diverges from the model name, and each
// attribute's `field` carries its underscored physical column name.
export const sequelize = {
  models: {
    CustomerArchive: {
      name: "CustomerArchive",
      tableName: "tbl_customer",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        fullName: { type: dataType("STRING"), field: "full_name" },
        email: { type: dataType("STRING") },
      },
      associations: {},
    },
    Tag: {
      name: "Tag",
      tableName: "Tags",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        name: { type: dataType("STRING") },
      },
      associations: {},
    },
  },
  define: () => {},
};
