function dataType(name, values) {
  return { constructor: { name }, values };
}

// A join model with a composite primary key (@@id-style, via
// primaryKeyAttributes) and a multi-column unique index (options.indexes).
export const sequelize = {
  models: {
    Membership: {
      name: "Membership",
      primaryKeyAttributes: ["userId", "orgId"],
      options: {
        indexes: [
          // Field entries come as bare strings or { name } objects — cover both.
          { unique: true, fields: ["orgId", { name: "role" }] },
          // Single-column unique index: already on the field, must be ignored.
          { unique: true, fields: ["slug"] },
          // Non-unique composite index: not a unique, must be ignored.
          { fields: ["userId", "role"] },
        ],
      },
      rawAttributes: {
        userId: { type: dataType("INTEGER"), primaryKey: true },
        orgId: { type: dataType("INTEGER"), primaryKey: true },
        role: { type: dataType("STRING"), allowNull: false },
        slug: { type: dataType("STRING"), unique: true },
      },
      associations: {},
    },
  },
  define: () => {},
};
