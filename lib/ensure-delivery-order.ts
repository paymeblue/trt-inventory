import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { orders, products } from "@/db/schema";
import { insertOrderItemLinesForSku } from "@/lib/order-item-line";
import type { LogisticsGateDb } from "@/lib/logistics-gate-order";

const OPEN_DELIVERY_STATUSES = ["draft", "active", "anomaly"] as const;

/**
 * Ensures an on-site delivery shipment exists for an active project.
 * The logistics gate order is warehouse-only; receivers fulfill this order.
 * Idempotent — safe on project activation and on first installer scan.
 */
export async function ensureDeliveryOrder(
  tx: LogisticsGateDb,
  params: {
    projectId: string;
    createdBy: string;
    createdById: string | null;
  },
): Promise<{ orderId: string; created: boolean }> {
  const existing = await tx.query.orders.findFirst({
    where: and(
      eq(orders.projectId, params.projectId),
      eq(orders.isLogisticsGate, false),
      inArray(orders.status, [...OPEN_DELIVERY_STATUSES]),
    ),
    with: { items: true },
    orderBy: [desc(orders.createdAt)],
  });

  if (existing && existing.items.length > 0) {
    return { orderId: existing.id, created: false };
  }

  let orderId = existing?.id;
  let created = false;

  if (!orderId) {
    const [orderRow] = await tx
      .insert(orders)
      .values({
        projectId: params.projectId,
        createdBy: params.createdBy,
        createdById: params.createdById,
        status: "active",
      })
      .returning();
    orderId = orderRow.id;
    created = true;
  }

  const prods = await tx.query.products.findMany({
    where: eq(products.projectId, params.projectId),
    orderBy: [asc(products.sku)],
  });

  for (const p of prods) {
    await insertOrderItemLinesForSku(tx, orderId, p.sku, p.stockQuantity);
  }

  return { orderId, created: created || !existing };
}

/** Convenience wrapper for scan resolution (outside an open transaction). */
export async function ensureDeliveryOrderForProject(projectId: string) {
  return db.transaction(async (tx) =>
    ensureDeliveryOrder(tx, {
      projectId,
      createdBy: "Auto dispatch",
      createdById: null,
    }),
  );
}
