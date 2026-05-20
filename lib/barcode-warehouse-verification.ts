import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { db } from "@/db";
import { orderItems, orders } from "@/db/schema";

type DbLike = Pick<typeof db, "select">;

/**
 * True when on-site verification may proceed for this barcode/SKU.
 *
 * 1. Same barcode was scanned in the warehouse (gate order line), or
 * 2. SKU pool: warehouse has verified more gate units than on-site scans
 *    already consumed for that SKU (delivery orders use new barcodes per line).
 */
export async function isBarcodeWarehouseVerified(
  tx: DbLike,
  projectId: string,
  barcode: string,
  sku: string,
): Promise<boolean> {
  const [exact] = await tx
    .select({ id: orderItems.id })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.projectId, projectId),
        sql`lower(${orderItems.barcode}) = lower(${barcode})`,
        isNotNull(orderItems.logisticsScannedAt),
      ),
    )
    .limit(1);
  if (exact) return true;

  const [{ warehouseCount }] = await tx
    .select({
      warehouseCount: sql<number>`count(*)::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.projectId, projectId),
        eq(orders.isLogisticsGate, true),
        eq(orderItems.productId, sku),
        isNotNull(orderItems.logisticsScannedAt),
      ),
    );

  const [{ siteCount }] = await tx
    .select({
      siteCount: sql<number>`count(*)::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.projectId, projectId),
        eq(orders.isLogisticsGate, false),
        eq(orderItems.productId, sku),
        isNotNull(orderItems.scannedAt),
      ),
    );

  return (warehouseCount ?? 0) > (siteCount ?? 0);
}
