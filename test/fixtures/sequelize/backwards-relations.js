function dataType(name, values) {
  return { constructor: { name }, values };
}

// Regression fixture for two generator bugs found by comparing a generated
// ERD against a hand-maintained one on a real project.
//
// 1. Order.orderCode is a plain column that happens to share a name with
//    OrderItem's actual FK column (also "orderCode"). Only OrderItem's own
//    BelongsTo association should mark it as FK — not Order's unrelated
//    HasMany, whose foreignKey names a column on the *target*, not on Order
//    itself.
//
// 2. A BelongsTo with no reciprocal HasMany/HasOne registered on the parent
//    used to always render as a backwards, forced 1-1 (child on the left).
//    It should render parent-on-left, and use the FK column's own
//    uniqueness to decide 1-1 vs 1-n:
//    - Invoice.customerId is not unique -> Customer 1-n Invoice.
//    - Account.customerId is unique -> Customer 1-1 Account.
//    - Customer<->Profile declares an explicit HasOne/BelongsTo pair, so it
//      stays 1-1 (parent-on-left) even though the FK isn't unique.
export const sequelize = {
  models: {
    Order: {
      name: "Order",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        orderCode: { type: dataType("STRING") },
      },
      associations: {
        items: {
          associationType: "HasMany",
          foreignKey: "orderCode",
          target: { name: "OrderItem" },
          as: "items",
        },
      },
    },
    OrderItem: {
      name: "OrderItem",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        orderCode: { type: dataType("STRING") },
      },
      associations: {
        order: {
          associationType: "BelongsTo",
          foreignKey: "orderCode",
          target: { name: "Order" },
          as: "order",
        },
      },
    },
    Customer: {
      name: "Customer",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
      },
      associations: {
        profile: {
          associationType: "HasOne",
          foreignKey: "customerId",
          target: { name: "Profile" },
          as: "profile",
        },
      },
    },
    Invoice: {
      name: "Invoice",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        customerId: { type: dataType("INTEGER") },
      },
      associations: {
        customer: {
          associationType: "BelongsTo",
          foreignKey: "customerId",
          target: { name: "Customer" },
          as: "customer",
        },
      },
    },
    Account: {
      name: "Account",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        customerId: { type: dataType("INTEGER"), unique: true },
      },
      associations: {
        customer: {
          associationType: "BelongsTo",
          foreignKey: "customerId",
          target: { name: "Customer" },
          as: "customer",
        },
      },
    },
    Profile: {
      name: "Profile",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        customerId: { type: dataType("INTEGER") },
      },
      associations: {
        customer: {
          associationType: "BelongsTo",
          foreignKey: "customerId",
          target: { name: "Customer" },
          as: "customer",
        },
      },
    },
  },
  define: () => {},
};
