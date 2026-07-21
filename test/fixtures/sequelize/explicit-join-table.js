function dataType(name, values) {
  return { constructor: { name }, values };
}

// Mirrors the common Sequelize pattern where a junction is an explicit,
// registered model: each side declares hasMany/belongsTo TO the junction
// *and* a convenience belongsToMany OVER it (through: JunctionModel). The
// belongsToMany's `.through.model.name` matches the junction's key in
// `.models`, so the derived n-n should be suppressed in favor of the two
// 1-n edges to the junction.
export const sequelize = {
  models: {
    Department: {
      name: "Department",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        name: { type: dataType("STRING"), allowNull: false },
      },
      associations: {
        assignments: {
          associationType: "HasMany",
          foreignKey: "departmentId",
          target: { name: "DepartmentGroup" },
          as: "assignments",
        },
        groups: {
          associationType: "BelongsToMany",
          foreignKey: "departmentId",
          otherKey: "groupId",
          target: { name: "Group" },
          as: "groups",
          through: { model: { name: "DepartmentGroup" } },
        },
      },
    },
    Group: {
      name: "Group",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        name: { type: dataType("STRING"), allowNull: false },
      },
      associations: {
        assignments: {
          associationType: "HasMany",
          foreignKey: "groupId",
          target: { name: "DepartmentGroup" },
          as: "assignments",
        },
        departments: {
          associationType: "BelongsToMany",
          foreignKey: "groupId",
          otherKey: "departmentId",
          target: { name: "Department" },
          as: "departments",
          through: { model: { name: "DepartmentGroup" } },
        },
      },
    },
    DepartmentGroup: {
      name: "DepartmentGroup",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        departmentId: { type: dataType("INTEGER") },
        groupId: { type: dataType("INTEGER") },
      },
      associations: {
        department: {
          associationType: "BelongsTo",
          foreignKey: "departmentId",
          target: { name: "Department" },
          as: "department",
        },
        group: {
          associationType: "BelongsTo",
          foreignKey: "groupId",
          target: { name: "Group" },
          as: "group",
        },
      },
    },
  },
  define: () => {},
};
