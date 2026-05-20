import { relations, sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
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

export const roleEnum = pgEnum("user_role", [
  "pm",
  "installer",
  "logistics",
  "super_admin",
]);
export type Role = (typeof roleEnum.enumValues)[number];

export const projectApprovalStatusEnum = pgEnum("project_approval_status", [
  "pending_super_admin",
  "rejected_super_admin",
  "pending_logistics",
  "rejected_logistics",
  "active",
]);
export type ProjectApprovalStatus =
  (typeof projectApprovalStatusEnum.enumValues)[number];

export const disputeStatusEnum = pgEnum("dispute_status", [
  "open",
  "under_review",
  "awaiting_response",
  "resolved",
  "closed",
]);
export type DisputeStatus = (typeof disputeStatusEnum.enumValues)[number];

export const disputeCategoryEnum = pgEnum("dispute_category", [
  "delivery_shortage",
  "wrong_item",
  "damaged_goods",
  "scan_verification",
  "documentation",
  "other",
]);
export type DisputeCategory = (typeof disputeCategoryEnum.enumValues)[number];

export const disputePriorityEnum = pgEnum("dispute_priority", [
  "low",
  "normal",
  "high",
  "urgent",
]);
export type DisputePriority = (typeof disputePriorityEnum.enumValues)[number];

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull(),
    name: text("name").notNull(),
    /** Optional contact number for receivers (and other roles). */
    phone: text("phone"),
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
    /**
     * When set, only this installer may perform authenticated in-app scans
     * for orders under the project. Sticker-token QR scans are unchanged.
     */
    installerUserId: uuid("installer_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    /**
     * Gates visibility for installers and orders until logistics marks active.
     */
    approvalStatus: projectApprovalStatusEnum("approval_status")
      .notNull()
      .default("active"),
    /**
     * PM-proposed edits while the project is live; applies only after logistics
     * confirms (see POST …/approval).
     */
    pendingPatch: jsonb("pending_patch").$type<Record<string, unknown> | null>(),
    /** `metadata_pending_super_admin` → SA review → `metadata_pending_logistics`. */
    metadataChangeStage: text("metadata_change_stage"),
    pendingDeleteRequested: boolean("pending_delete_requested")
      .notNull()
      .default(false),
    /** Logistics-level project sticker; minted when super-admin approves. */
    projectBarcode: text("project_barcode"),
    /** Canonical install site — installer scans must be within geofence. */
    siteAddress: text("site_address"),
    siteLatitude: doublePrecision("site_latitude"),
    siteLongitude: doublePrecision("site_longitude"),
    geofenceRadiusMeters: integer("geofence_radius_meters")
      .notNull()
      .default(500),
  },
  (t) => [uniqueIndex("projects_name_unique").on(t.name)],
);

/**
 * PM-defined reusable labels (e.g. "Upper unit") for fast batch creation
 * of physical items inside a project.
 */
export const projectCategories = pgTable(
  "project_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("project_categories_project_name_lower_unique").on(
      t.projectId,
      sql`lower(${t.name})`,
    ),
  ],
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
    /** Optional group label when items are added via category picker. */
    categoryId: uuid("category_id").references(() => projectCategories.id, {
      onDelete: "set null",
    }),
    /** Rows created together in one PM action share a batch id (for display). */
    batchId: uuid("batch_id"),
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
  /**
   * Exactly one gate order may exist per project (partial unique index in SQL).
   * Seeded when super-admin approves; logistics scans lines here before activate.
   * Same stickers are later scanned on-site by installers (stock decrement).
   */
  isLogisticsGate: boolean("is_logistics_gate").notNull().default(false),
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
    /** Warehouse scan before project activation (no stock movement). */
    logisticsScannedAt: timestamp("logistics_scanned_at", { withTimezone: true }),
    logisticsScannedBy: text("logistics_scanned_by"),
    logisticsScannedById: uuid("logistics_scanned_by_id").references(() => users.id),
    scanLatitude: doublePrecision("scan_latitude"),
    scanLongitude: doublePrecision("scan_longitude"),
    geofenceFlagged: boolean("geofence_flagged").notNull().default(false),
    logisticsScanLatitude: doublePrecision("logistics_scan_latitude"),
    logisticsScanLongitude: doublePrecision("logistics_scan_longitude"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("order_items_barcode_unique").on(t.barcode),
    /** Multiple physical lines may share the same product SKU (e.g. 10 boxes). */
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

/** Escalation thread with optional screenshot; formal resolution workflow. */
export const disputes = pgTable("disputes", {
  id: uuid("id").defaultRandom().primaryKey(),
  createdById: uuid("created_by_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  orderId: uuid("order_id").references(() => orders.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  photoPath: text("photo_path"),
  status: disputeStatusEnum("status").notNull().default("open"),
  category: disputeCategoryEnum("category"),
  priority: disputePriorityEnum("priority").notNull().default("normal"),
  assignedToId: uuid("assigned_to_id").references(() => users.id, {
    onDelete: "set null",
  }),
  resolutionSummary: text("resolution_summary"),
  resolvedById: uuid("resolved_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Immutable audit trail for dispute lifecycle (export + accountability). */
export const disputeEvents = pgTable("dispute_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  disputeId: uuid("dispute_id")
    .notNull()
    .references(() => disputes.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(),
  detail: jsonb("detail"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const disputeMessages = pgTable("dispute_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  disputeId: uuid("dispute_id")
    .notNull()
    .references(() => disputes.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const disputesRelations = relations(disputes, ({ one, many }) => ({
  creator: one(users, {
    fields: [disputes.createdById],
    references: [users.id],
  }),
  assignee: one(users, {
    fields: [disputes.assignedToId],
    references: [users.id],
    relationName: "disputeAssignee",
  }),
  resolver: one(users, {
    fields: [disputes.resolvedById],
    references: [users.id],
    relationName: "disputeResolver",
  }),
  project: one(projects, {
    fields: [disputes.projectId],
    references: [projects.id],
  }),
  order: one(orders, {
    fields: [disputes.orderId],
    references: [orders.id],
  }),
  messages: many(disputeMessages),
  events: many(disputeEvents),
}));

export const disputeEventsRelations = relations(disputeEvents, ({ one }) => ({
  dispute: one(disputes, {
    fields: [disputeEvents.disputeId],
    references: [disputes.id],
  }),
  actor: one(users, {
    fields: [disputeEvents.userId],
    references: [users.id],
  }),
}));

export const disputeMessagesRelations = relations(disputeMessages, ({ one }) => ({
  dispute: one(disputes, {
    fields: [disputeMessages.disputeId],
    references: [disputes.id],
  }),
  author: one(users, {
    fields: [disputeMessages.userId],
    references: [users.id],
  }),
}));

export const projectsRelations = relations(projects, ({ many, one }) => ({
  items: many(products),
  categories: many(projectCategories),
  disputes: many(disputes),
  orders: many(orders),
  createdByUser: one(users, {
    fields: [projects.createdById],
    references: [users.id],
  }),
  assignedInstaller: one(users, {
    fields: [projects.installerUserId],
    references: [users.id],
  }),
}));

export const projectCategoriesRelations = relations(
  projectCategories,
  ({ one, many }) => ({
    project: one(projects, {
      fields: [projectCategories.projectId],
      references: [projects.id],
    }),
    products: many(products),
  }),
);

export const productsRelations = relations(products, ({ one }) => ({
  project: one(projects, {
    fields: [products.projectId],
    references: [projects.id],
  }),
  category: one(projectCategories, {
    fields: [products.categoryId],
    references: [projectCategories.id],
  }),
}));

export const ordersRelations = relations(orders, ({ many, one }) => ({
  items: many(orderItems),
  disputes: many(disputes),
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
  disputesOpened: many(disputes),
  disputeMessages: many(disputeMessages),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ProjectCategory = typeof projectCategories.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type Dispute = typeof disputes.$inferSelect;
export type DisputeMessage = typeof disputeMessages.$inferSelect;
export type DisputeEvent = typeof disputeEvents.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
export type StockMovement = typeof stockMovements.$inferSelect;
