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
          // Non-unique composite index: not a unique constraint, carried as
          // a plain Index instead.
          { fields: ["userId", "role"], name: "user_role_idx" },
          // Non-unique single-column index, deliberately left unnamed to
          // test the no-name path. A real `sequelize.define()`/`Model.init()`
          // call would auto-name this (Utils.nameIndex in sequelize's own
          // lib/utils.js, e.g. "memberships_role") — this hand-mocked
          // fixture bypasses that normalization, so `name` stays undefined.
          { fields: ["role"] },
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
