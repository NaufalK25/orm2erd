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
    // The `unique: 'groupName'` shorthand — real Sequelize's Model.init()
    // groups these into `model.uniqueKeys`, never `options.indexes` (#4b).
    // `uniqueKeys` is keyed by physical column name (`a_col`/`b_col`), which
    // differs from the attribute name here to also exercise the
    // column->attribute mapping.
    UniqueGroup: {
      name: "UniqueGroup",
      primaryKeyAttributes: ["id"],
      uniqueKeys: {
        grp: { fields: ["a_col", "b_col"], name: "grp" },
        // A single-column group (the plain `unique: true` shorthand also
        // lands here in real Sequelize) — must stay off `entity.uniques`
        // and only set the field's own `isUnique`.
        unique_group_c_unique: { fields: ["c"], name: "unique_group_c_unique" },
      },
      options: {},
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        a: { type: dataType("STRING"), unique: "grp", field: "a_col" },
        b: { type: dataType("STRING"), unique: "grp", field: "b_col" },
        c: { type: dataType("STRING"), unique: true },
      },
      associations: {},
    },
  },
  define: () => {},
};
