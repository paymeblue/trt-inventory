import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  orderItems,
  orders,
  products,
  stockMovements,
} from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";
import { computeProgress, resolveScan } from "@/lib/scan";

const scanSchema = z.object({
  barcode: z.string().trim().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser("installer");
  if ("error" in auth) return auth.error;
  try {
    const { id } = await params;
    const { barcode } = scanSchema.parse(await req.json());

    const result = await db.transaction(async (tx) => {
      const order = await tx.query.orders.findFirst({
        where: eq(orders.id, id),
      });
      if (!order) return { http: jsonError(404, "Order not found") };
      if (order.status === "fulfilled") {
        return {
          http: jsonError(400, "Order is already fully fulfilled"),
        };
      }

      // Lock the specific order_item row that's about to be scanned. This
      // blocks any concurrent scan transaction targeting the same barcode
      // until we commit, preventing double-scans from decrementing stock
      // twice or flipping the order to fulfilled twice.
      //
      // If no row matches (barcode not part of this order) the SELECT is a
      // no-op and we fall through to the "invalid" outcome as before.
      await tx.execute(sql`
        SELECT id FROM order_items
        WHERE order_id = ${id}::uuid AND barcode = ${barcode}
        FOR UPDATE
      `);

      const items = await tx.query.orderItems.findMany({
        where: eq(orderItems.orderId, id),
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

        await tx
          .update(orderItems)
          .set({
            scannedAt: new Date(),
            scannedBy: auth.actor.name,
            scannedById: auth.actor.userId,
          })
          .where(eq(orderItems.id, outcome.itemId));

        const [prodRow] = await tx
          .update(products)
          .set({ stockQuantity: sql`${products.stockQuantity} - 1` })
          .where(eq(products.sku, sku))
          .returning({ stock: products.stockQuantity, id: products.id });

        if (!prodRow) {
          // The SKU referenced on this order_item no longer exists in the
          // warehouse (deleted after the order was built). Bail out loudly
          // instead of silently "succeeding" with no stock record — the
          // transaction will roll back the item scan as well.
          return {
            http: jsonError(
              409,
              `Warehouse SKU "${sku}" no longer exists. Recreate it or rebuild the order.`,
            ),
          };
        }
        stockAfter = prodRow.stock;
        await tx.insert(stockMovements).values({
          productId: prodRow.id,
          delta: -1,
          reason: "order_scan",
          orderId: id,
          orderItemId: outcome.itemId,
          userId: auth.actor.userId,
        });
      }

      let updatedOrder = order;
      if (nextStatus && nextStatus !== order.status) {
        const [row] = await tx
          .update(orders)
          .set({
            status: nextStatus,
            ...(nextStatus === "fulfilled"
              ? { fulfilledAt: new Date() }
              : {}),
          })
          .where(eq(orders.id, id))
          .returning();
        updatedOrder = row;
      }

      const freshItems = await tx.query.orderItems.findMany({
        where: eq(orderItems.orderId, id),
      });

      return {
        response: {
          outcome,
          order: updatedOrder,
          progress: computeProgress(freshItems),
          stock:
            outcome.result === "valid" && stockAfter !== null
              ? { sku, stockQuantity: stockAfter }
              : undefined,
        },
      };
    });

    if ("http" in result) return result.http;
    return NextResponse.json(result.response);
  } catch (err) {
    return handleError(err);
  }
}
