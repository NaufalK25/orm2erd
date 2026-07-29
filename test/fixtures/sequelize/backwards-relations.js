function dataType(name, values) {
  return { constructor: { name }, values };
}

// Regression fixture for generator bugs found by comparing a generated ERD
// against a hand-maintained one on a real project.
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
//    - Customer<->Transaction declares an explicit HasOne/BelongsTo pair, so
//      it stays 1-1 (parent-on-left) even though the FK isn't unique.
//
// 3. Warehouse.hasMany(Shipment) has no reciprocal .belongsTo() anywhere —
//    real Sequelize still writes `references` onto Shipment.warehouseId via
//    HasMany's own _injectAttributes (addForeignKeyConstraints runs for any
//    association type, not just BelongsTo). FK detection must read that
//    per-attribute `references`, not reconstruct it from which side declared
//    the association, or this column is silently missed.
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
        orderCode: {
          type: dataType("STRING"),
          references: { model: "Orders", key: "id" },
        },
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
        transaction: {
          associationType: "HasOne",
          foreignKey: "customerId",
          target: { name: "Transaction" },
          as: "transaction",
        },
      },
    },
    Invoice: {
      name: "Invoice",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        customerId: {
          type: dataType("INTEGER"),
          references: { model: "Customers", key: "id" },
        },
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
        customerId: {
          type: dataType("INTEGER"),
          unique: true,
          references: { model: "Customers", key: "id" },
        },
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
    Transaction: {
      name: "Transaction",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        customerId: {
          type: dataType("INTEGER"),
          references: { model: "Customers", key: "id" },
        },
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
    Warehouse: {
      name: "Warehouse",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
      },
      associations: {
        shipments: {
          associationType: "HasMany",
          foreignKey: "warehouseId",
          target: { name: "Shipment" },
          as: "shipments",
        },
      },
    },
    Shipment: {
      name: "Shipment",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        warehouseId: {
          type: dataType("INTEGER"),
          references: { model: "Warehouses", key: "id" },
        },
      },
      associations: {},
    },
  },
  define: () => {},
};
