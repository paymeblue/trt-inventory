import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders } from "@/db/schema";

/**
 * A project may only receive a **new** order while it has no open shipment
 * snapshot, no fulfilled orders, and no on-site verified line (`scanned_at`).
 * Otherwise creating another order would collide with the logistics gate order
 * or re-seed SKUs incorrectly.
 */
export async function findProjectIdsBlockedForNewOrder(): Promise<Set<string>> {
  const blocked = new Set<string>();

  const activeRows = await db
    .select({ projectId: orders.projectId })
    .from(orders)
    .where(inArray(orders.status, ["draft", "active", "anomaly"]))
    .groupBy(orders.projectId);

  for (const r of activeRows) blocked.add(r.projectId);

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
  const [activeOrPending] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.projectId, projectId),
        inArray(orders.status, ["draft", "active", "anomaly"]),
      ),
    )
    .limit(1);

  if (activeOrPending) return false;

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
