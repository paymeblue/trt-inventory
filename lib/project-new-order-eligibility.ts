import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders } from "@/db/schema";

/**
 * A project may only receive a **new** order while it has no fulfillment
 * history: no fulfilled order, and no order line that has ever been verified
 * (scanned). Otherwise creating another order would re-seed all SKUs and
 * verifications could decrement project stock past zero.
 */
export async function findProjectIdsBlockedForNewOrder(): Promise<Set<string>> {
  const blocked = new Set<string>();

  const fulfilledRows = await db
    .select({ projectId: orders.projectId })
    .from(orders)
    .where(eq(orders.status, "fulfilled"))
    .groupBy(orders.projectId);

  for (const r of fulfilledRows) blocked.add(r.projectId);

  const scannedRows = await db
    .select({ projectId: orders.projectId })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(isNotNull(orderItems.scannedAt))
    .groupBy(orders.projectId);

  for (const r of scannedRows) blocked.add(r.projectId);

  return blocked;
}

export async function isProjectEligibleForNewOrder(
  projectId: string,
): Promise<boolean> {
  const [fulfilled] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(eq(orders.projectId, projectId), eq(orders.status, "fulfilled")),
    )
    .limit(1);

  if (fulfilled) return false;

  const [scanned] = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(eq(orders.projectId, projectId), isNotNull(orderItems.scannedAt)),
    )
    .limit(1);

  return !scanned;
}
