import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders } from "@/db/schema";

/** PM delivery orders only — the logistics gate list is separate. */
const pmOrderOnly = eq(orders.isLogisticsGate, false);

/**
 * A project may only receive a **new** PM delivery order while it has no open
 * delivery snapshot, no fulfilled delivery orders, and no on-site verified
 * delivery line (`scanned_at`). The logistics gate order does not count.
 */
export async function findProjectIdsBlockedForNewOrder(): Promise<Set<string>> {
  const blocked = new Set<string>();

  const activeRows = await db
    .select({ projectId: orders.projectId })
    .from(orders)
    .where(
      and(
        pmOrderOnly,
        inArray(orders.status, ["draft", "active", "anomaly"]),
      ),
    )
    .groupBy(orders.projectId);

  for (const r of activeRows) blocked.add(r.projectId);

  const fulfilledRows = await db
    .select({ projectId: orders.projectId })
    .from(orders)
    .where(and(pmOrderOnly, eq(orders.status, "fulfilled")))
    .groupBy(orders.projectId);

  for (const r of fulfilledRows) blocked.add(r.projectId);

  const scannedRows = await db
    .select({ projectId: orders.projectId })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(and(pmOrderOnly, isNotNull(orderItems.scannedAt)))
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
        pmOrderOnly,
        inArray(orders.status, ["draft", "active", "anomaly"]),
      ),
    )
    .limit(1);

  if (activeOrPending) return false;

  const [fulfilled] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.projectId, projectId),
        pmOrderOnly,
        eq(orders.status, "fulfilled"),
      ),
    )
    .limit(1);

  if (fulfilled) return false;

  const [scanned] = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.projectId, projectId),
        pmOrderOnly,
        isNotNull(orderItems.scannedAt),
      ),
    )
    .limit(1);

  return !scanned;
}
