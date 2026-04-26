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
     * open on their first visit to a page that wires one up.
     */
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    /**
     * When the user submitted a "forgot password" request from the public
     * sign-in screen. PMs see these as a queue on /team and reset the
     * password on the user's behalf (no email infra required). Cleared
     * the moment the new password is issued.
     */
    passwordResetRequestedAt: timestamp("password_reset_requested_at", {
      withTimezone: true,
    }),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

/**
 * Projects are the top-level container. Replaces the old global warehouse:
 * every item (SKU + stock) belongs to exactly one project, and every order
 * is scoped to one project. Items can never be used by another project.
 */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    createdById: uuid("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("projects_name_unique").on(t.name)],
);

/**
 * Items live inside a project. SKUs are only unique within the parent
 * project (so "INV-001" can exist in Project A and Project B separately).
 * Deleting a project cascades its items away.
 */
export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    stockQuantity: integer("stock_quantity").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("products_project_sku_unique").on(t.projectId, t.sku)],
);

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "restrict" }),
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
    /**
     * Stores the SKU string of the product line at the time of creation.
     * We keep this as text (not an FK) so deleting a project's product
     * doesn't orphan historical order_items — the SKU remains as a
     * snapshot for audit. Cross-project validation is enforced at the
     * application layer when items are added to an order.
     */
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

export const projectsRelations = relations(projects, ({ many, one }) => ({
  items: many(products),
  orders: many(orders),
  createdByUser: one(users, {
    fields: [projects.createdById],
    references: [users.id],
  }),
}));

export const productsRelations = relations(products, ({ one }) => ({
  project: one(projects, {
    fields: [products.projectId],
    references: [projects.id],
  }),
}));

export const ordersRelations = relations(orders, ({ many, one }) => ({
  items: many(orderItems),
  project: one(projects, {
    fields: [orders.projectId],
    references: [projects.id],
  }),
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
  createdProjects: many(projects),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
export type StockMovement = typeof stockMovements.$inferSelect;
