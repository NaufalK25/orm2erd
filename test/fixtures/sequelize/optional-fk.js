function dataType(name, values) {
  return { constructor: { name }, values };
}

// Fixture for #1 (cardinality: optional vs required ends) — pairs of
// relations that only differ in FK nullability, plus the composite-PK-FK
// edge case where `allowNull` is never set even though the column is
// implicitly NOT NULL (same quirk `isNullable` already special-cases).
export const sequelize = {
  models: {
    Customer: {
      name: "Customer",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
      },
      associations: {
        invoices: {
          associationType: "HasMany",
          foreignKey: "customerId",
          target: { name: "Invoice" },
          as: "invoices",
        },
        payments: {
          associationType: "HasMany",
          foreignKey: "customerId",
          target: { name: "Payment" },
          as: "payments",
        },
      },
    },
    // 1-n, FK NOT NULL -> isFromOptional: false.
    Invoice: {
      name: "Invoice",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        customerId: {
          type: dataType("INTEGER"),
          allowNull: false,
          references: { model: "Customers", key: "id" },
        },
      },
      associations: {},
    },
    // 1-n, FK nullable -> isFromOptional: true.
    Payment: {
      name: "Payment",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        customerId: {
          type: dataType("INTEGER"),
          allowNull: true,
          references: { model: "Customers", key: "id" },
        },
      },
      associations: {},
    },
    Product: {
      name: "Product",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
      },
      associations: {
        // 1-1, FK NOT NULL (Barcode.productId) -> isFromOptional: false.
        barcode: {
          associationType: "HasOne",
          foreignKey: "productId",
          target: { name: "Barcode" },
          as: "barcode",
        },
      },
    },
    Barcode: {
      name: "Barcode",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        productId: {
          type: dataType("INTEGER"),
          allowNull: false,
          unique: true,
          references: { model: "Products", key: "id" },
        },
      },
      associations: {
        product: {
          associationType: "BelongsTo",
          foreignKey: "productId",
          target: { name: "Product" },
          as: "product",
        },
      },
    },
    Supplier: {
      name: "Supplier",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
      },
      associations: {
        // 1-1, FK nullable (Contract.supplierId) -> isFromOptional: true.
        contract: {
          associationType: "HasOne",
          foreignKey: "supplierId",
          target: { name: "Contract" },
          as: "contract",
        },
      },
    },
    Contract: {
      name: "Contract",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        supplierId: {
          type: dataType("INTEGER"),
          unique: true,
          references: { model: "Suppliers", key: "id" },
        },
      },
      associations: {
        supplier: {
          associationType: "BelongsTo",
          foreignKey: "supplierId",
          target: { name: "Supplier" },
          as: "supplier",
        },
      },
    },
    // Explicit junction table with a composite PK over its two FK columns
    // (same shape as test/fixtures/e2e/sequelize-app's PostTag) — rawAttributes
    // never sets allowNull on a primary-key column even though it's
    // implicitly NOT NULL, so isFromOptional must consult `primaryKey`
    // the same way the field-level `isNullable` already does.
    Order: {
      name: "Order",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
      },
      associations: {
        items: {
          associationType: "HasMany",
          foreignKey: "orderId",
          target: { name: "OrderItem" },
          as: "items",
        },
      },
    },
    OrderItem: {
      name: "OrderItem",
      rawAttributes: {
        orderId: { type: dataType("INTEGER"), primaryKey: true },
        productId: { type: dataType("INTEGER"), primaryKey: true },
      },
      associations: {
        order: {
          associationType: "BelongsTo",
          foreignKey: "orderId",
          target: { name: "Order" },
          as: "order",
        },
      },
    },
  },
  define: () => {},
};
