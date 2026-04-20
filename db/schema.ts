import { relations } from "drizzle-orm";
import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const orderStatusEnum = pgEnum("order_status", [
  "draft",
  "active",
  "fulfilled",
  "anomaly",
]);
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];

export const roleEnum = pgEnum("user_role", ["pm", "installer"]);
export type Role = (typeof roleEnum.enumValues)[number];

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull(),
    name: text("name").notNull(),
    createdById: uuid("created_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    /**
     * Timestamp at which the user finished (or skipped) the guided product
     * tour. Null means they're a brand-new user and the tour should auto-
     * open on their first visit to a page that wires one up. Once set,
     * the tour never auto-opens again — they can still re-open it manually
     * via the "? Guided tour" floating button.
     */
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    stockQuantity: integer("stock_quantity").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("products_sku_unique").on(t.sku)],
);

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectName: text("project_name").notNull(),
  status: orderStatusEnum("status").notNull().default("draft"),
  createdBy: text("created_by").notNull(),
  createdById: uuid("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
});

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull(),
    barcode: text("barcode").notNull(),
    scannedAt: timestamp("scanned_at", { withTimezone: true }),
    scannedBy: text("scanned_by"),
    scannedById: uuid("scanned_by_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("order_items_barcode_unique").on(t.barcode),
    uniqueIndex("order_items_order_product_unique").on(t.orderId, t.productId),
  ],
);

export const stockMovements = pgTable("stock_movements", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(),
  orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
  orderItemId: uuid("order_item_id").references(() => orderItems.id, {
    onDelete: "set null",
  }),
  userId: uuid("user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const ordersRelations = relations(orders, ({ many, one }) => ({
  items: many(orderItems),
  createdByUser: one(users, {
    fields: [orders.createdById],
    references: [users.id],
  }),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  scannedByUser: one(users, {
    fields: [orderItems.scannedById],
    references: [users.id],
  }),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  creator: one(users, {
    fields: [users.createdById],
    references: [users.id],
  }),
  createdOrders: many(orders),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
export type StockMovement = typeof stockMovements.$inferSelect;
