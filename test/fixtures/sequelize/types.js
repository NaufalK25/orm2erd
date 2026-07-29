function dataType(name, extra = {}) {
  return { constructor: { name }, ...extra };
}

// A model exercising the native-type mapping quirks from the fidelity
// review: DataTypes.JSON's internal class name ("JSONTYPE") diverging from
// its public type key ("JSON"), and DataTypes.ARRAY(...) wrapping its
// element type on `.type` rather than exposing it directly.
export const sequelize = {
  models: {
    Product: {
      name: "Product",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        // Verified against installed Sequelize v6: constructor.name
        // "JSONTYPE", key "JSON" — reading constructor.name directly (the
        // pre-fix behavior) renders "JSONTYPE" instead of "JSON".
        metadata: { type: dataType("JSONTYPE", { key: "JSON" }) },
        // JSONB's constructor.name and key already agree ("JSONB"), unlike
        // JSON's — kept alongside it as a contrast case.
        settings: { type: dataType("JSONB") },
        externalRef: { type: dataType("UUID") },
        tags: { type: dataType("ARRAY", { type: dataType("STRING") }) },
        roles: {
          type: dataType("ARRAY", {
            type: dataType("ENUM", { values: ["admin", "member"] }),
          }),
        },
      },
      associations: {},
    },
  },
  define: () => {},
};
