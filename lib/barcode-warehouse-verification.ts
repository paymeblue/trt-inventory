import { and, eq, isNotNull } from "drizzle-orm";
import type { db } from "@/db";
import { orderItems, orders } from "@/db/schema";

type DbLike = Pick<typeof db, "select">;

/**
 * True when any line in the project with this barcode was scanned in the
 * warehouse (logistics gate flow). Receivers reuse the same sticker codes.
 */
export async function isBarcodeWarehouseVerified(
  tx: DbLike,
  projectId: string,
  barcode: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: orderItems.id })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.projectId, projectId),
        eq(orderItems.barcode, barcode),
        isNotNull(orderItems.logisticsScannedAt),
      ),
    )
    .limit(1);
  return Boolean(row);
}
