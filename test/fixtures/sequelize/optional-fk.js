function dataType(name, values) {
  return { constructor: { name }, values };
}

// Fixture for #1 (cardinality: optional vs required ends) — pairs of
// relations that only differ in FK nullability, plus the composite-PK-FK
// edge case where `allowNull` is never set even though the column is
// implicitly NOT NULL (same quirk `isNullable` already special-cases).
export const sequelize = {
  models: {
    Company: {
      name: "Company",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
      },
      associations: {
        employees: {
          associationType: "HasMany",
          foreignKey: "companyId",
          target: { name: "Employee" },
          as: "employees",
        },
        contractors: {
          associationType: "HasMany",
          foreignKey: "companyId",
          target: { name: "Contractor" },
          as: "contractors",
        },
      },
    },
    // 1-n, FK NOT NULL -> isFromOptional: false.
    Employee: {
      name: "Employee",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        companyId: {
          type: dataType("INTEGER"),
          allowNull: false,
          references: { model: "Companies", key: "id" },
        },
      },
      associations: {},
    },
    // 1-n, FK nullable -> isFromOptional: true.
    Contractor: {
      name: "Contractor",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        companyId: {
          type: dataType("INTEGER"),
          allowNull: true,
          references: { model: "Companies", key: "id" },
        },
      },
      associations: {},
    },
    HeadOffice: {
      name: "HeadOffice",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
      },
      associations: {
        // 1-1, FK NOT NULL (HeadquarterAddress.headOfficeId) -> isFromOptional: false.
        address: {
          associationType: "HasOne",
          foreignKey: "headOfficeId",
          target: { name: "HeadquarterAddress" },
          as: "address",
        },
      },
    },
    HeadquarterAddress: {
      name: "HeadquarterAddress",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        headOfficeId: {
          type: dataType("INTEGER"),
          allowNull: false,
          unique: true,
          references: { model: "HeadOffices", key: "id" },
        },
      },
      associations: {
        headOffice: {
          associationType: "BelongsTo",
          foreignKey: "headOfficeId",
          target: { name: "HeadOffice" },
          as: "headOffice",
        },
      },
    },
    Branch: {
      name: "Branch",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
      },
      associations: {
        // 1-1, FK nullable (BranchAddress.branchId) -> isFromOptional: true.
        address: {
          associationType: "HasOne",
          foreignKey: "branchId",
          target: { name: "BranchAddress" },
          as: "address",
        },
      },
    },
    BranchAddress: {
      name: "BranchAddress",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        branchId: {
          type: dataType("INTEGER"),
          unique: true,
          references: { model: "Branches", key: "id" },
        },
      },
      associations: {
        branch: {
          associationType: "BelongsTo",
          foreignKey: "branchId",
          target: { name: "Branch" },
          as: "branch",
        },
      },
    },
    // Explicit junction table with a composite PK over its two FK columns
    // (same shape as test/fixtures/e2e/sequelize-app's PostTag) — rawAttributes
    // never sets allowNull on a primary-key column even though it's
    // implicitly NOT NULL, so isFromOptional must consult `primaryKey`
    // the same way the field-level `isNullable` already does.
    Project: {
      name: "Project",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
      },
      associations: {
        assignments: {
          associationType: "HasMany",
          foreignKey: "projectId",
          target: { name: "ProjectAssignment" },
          as: "assignments",
        },
      },
    },
    ProjectAssignment: {
      name: "ProjectAssignment",
      rawAttributes: {
        projectId: { type: dataType("INTEGER"), primaryKey: true },
        employeeId: { type: dataType("INTEGER"), primaryKey: true },
      },
      associations: {
        project: {
          associationType: "BelongsTo",
          foreignKey: "projectId",
          target: { name: "Project" },
          as: "project",
        },
      },
    },
  },
  define: () => {},
};
