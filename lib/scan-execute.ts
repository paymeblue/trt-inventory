import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  orderItems,
  orders,
  products,
  projects,
  stockMovements,
  type Order,
} from "@/db/schema";
import { logOrderCompleteEvent } from "@/lib/order-complete-event";
import { computeProgress, resolveScan, type ScanOutcome } from "@/lib/scan";
import type { AuthenticatedActor } from "@/lib/auth-guard";

export type ScanExecuteError =
  | { kind: "order_not_found" }
  | { kind: "order_fulfilled" }
  | { kind: "sku_deleted"; sku: string }
  | { kind: "insufficient_stock"; sku: string };

export interface ScanExecuteSuccess {
  kind: "ok";
  outcome: ScanOutcome;
  order: Order;
  progress: ReturnType<typeof computeProgress>;
  stock?: { sku: string; stockQuantity: number };
}

export type ScanExecuteResult = ScanExecuteSuccess | ScanExecuteError;

/**
 * Runs the full scan transaction for a known order. Used by:
 *   - POST /api/orders/[id]/scan (manual / camera / keyboard)
 *   - GET  /s/[barcode]          (QR deep-link from a phone camera)
 *
 * Safety guarantees:
 *   1. Refuses to touch a fulfilled order.
 *   2. SELECT ... FOR UPDATE serialises concurrent scans of the same
 *      order_item row.
 *   3. Stock decrement is scoped by (project_id, sku) now that SKUs
 *      are only unique per project — a collision across projects would
 *      otherwise decrement the wrong warehouse.
 *   4. Item scan + stock decrement + stock_movements audit row all
 *      commit atomically, or none of them do.
 *   5. Stock never drops below 0: if on-hand quantity is already 0, the
 *      verification is rejected (no order_item update, no movement).
 */
export async function executeScan({
  orderId,
  barcode,
  actor,
}: {
  orderId: string;
  barcode: string;
  actor: AuthenticatedActor;
}): Promise<ScanExecuteResult> {
  const result = await db.transaction(async (tx): Promise<ScanExecuteResult> => {
    const order = await tx.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });
    if (!order) return { kind: "order_not_found" };
    if (order.status === "fulfilled") return { kind: "order_fulfilled" };

    await tx.execute(sql`
      SELECT id FROM order_items
      WHERE order_id = ${orderId}::uuid AND barcode = ${barcode}
      FOR UPDATE
    `);

    const items = await tx.query.orderItems.findMany({
      where: eq(orderItems.orderId, orderId),
    });

    const { outcome, nextStatus } = resolveScan({
      barcode,
      items,
      orderStatus: order.status,
    });

    let stockAfter: number | null = null;
    let sku: string | null = null;

    if (outcome.result === "valid") {
      const matched = items.find((i) => i.id === outcome.itemId)!;
      sku = matched.productId;

      // Synthetic "Printed sticker" actor isn't a real users row — its
      // userId would violate the FK on scanned_by_id / stock_movements.
      // Both columns are nullable so we just write null and rely on the
      // human-readable `actor.name` for the audit trail.
      const fkUserId = actor.isPrintedScan ? null : actor.userId;

      const [prodRow] = await tx
        .update(products)
        .set({ stockQuantity: sql`${products.stockQuantity} - 1` })
        .where(
          and(
            eq(products.projectId, order.projectId),
            eq(products.sku, sku),
            gte(products.stockQuantity, 1),
          ),
        )
        .returning({ stock: products.stockQuantity, id: products.id });

      if (!prodRow) {
        const exists = await tx.query.products.findFirst({
          where: and(
            eq(products.projectId, order.projectId),
            eq(products.sku, sku),
          ),
          columns: { id: true },
        });
        if (!exists) return { kind: "sku_deleted", sku };
        return { kind: "insufficient_stock", sku };
      }

      stockAfter = prodRow.stock;

      await tx
        .update(orderItems)
        .set({
          scannedAt: new Date(),
          scannedBy: actor.name,
          scannedById: fkUserId,
        })
        .where(eq(orderItems.id, outcome.itemId));

      await tx.insert(stockMovements).values({
        productId: prodRow.id,
        delta: -1,
        reason: "order_scan",
        orderId,
        orderItemId: outcome.itemId,
        userId: fkUserId,
      });
    }

    let updatedOrder = order;
    if (nextStatus && nextStatus !== order.status) {
      const [row] = await tx
        .update(orders)
        .set({
          status: nextStatus,
          ...(nextStatus === "fulfilled" ? { fulfilledAt: new Date() } : {}),
        })
        .where(eq(orders.id, orderId))
        .returning();
      updatedOrder = row;
    }

    const freshItems = await tx.query.orderItems.findMany({
      where: eq(orderItems.orderId, orderId),
    });

    return {
      kind: "ok",
      outcome,
      order: updatedOrder,
      progress: computeProgress(freshItems),
      stock:
        outcome.result === "valid" && sku && stockAfter !== null
          ? { sku, stockQuantity: stockAfter }
          : undefined,
    };
  });

  if (
    result.kind === "ok" &&
    result.outcome.result === "valid" &&
    result.order.status === "fulfilled"
  ) {
    logOrderCompleteEvent({
      orderId,
      order: result.order,
      actor,
      progress: result.progress,
    });
  }

  return result;
}

/**
 * Resolves a bare barcode to the order_item it belongs to. Used by the
 * deep-link `/s/[barcode]` route so a phone camera QR scan can find the
 * right order without the user knowing the order id.
 *
 * Returns the item + its order + the parent project name, or null if
 * the barcode doesn't exist. Does NOT filter by order status — the
 * caller decides what to do with fulfilled orders.
 */
export async function findOrderByBarcode(barcode: string) {
  const [row] = await db
    .select({
      itemId: orderItems.id,
      itemBarcode: orderItems.barcode,
      itemScannedAt: orderItems.scannedAt,
      orderId: orders.id,
      orderStatus: orders.status,
      projectId: orders.projectId,
      projectName: projects.name,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(projects, eq(projects.id, orders.projectId))
    .where(eq(orderItems.barcode, barcode))
    .limit(1);
  return row ?? null;
}
