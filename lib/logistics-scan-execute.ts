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
import type { AuthenticatedActor } from "@/lib/auth-guard";
import { normalizeScanBarcode } from "@/lib/scan-deep-link";
import {
  computeLogisticsProgress,
  resolveLogisticsScan,
  type ScanOutcome,
} from "@/lib/scan";

export type LogisticsScanExecuteError =
  | { kind: "order_not_found" }
  | { kind: "not_gate_order" }
  | { kind: "wrong_project_status" }
  | { kind: "insufficient_stock"; sku: string }
  | { kind: "sku_deleted"; sku: string };

export interface LogisticsScanExecuteOk {
  kind: "ok";
  outcome: ScanOutcome;
  order: Order;
  progress: ReturnType<typeof computeLogisticsProgress>;
  stock?: { sku: string; stockQuantity: number };
}

export type LogisticsScanExecuteResult =
  | LogisticsScanExecuteOk
  | LogisticsScanExecuteError;

/**
 * Warehouse-side scan before project activation. Marks the gate line and
 * decrements on-hand stock (one unit per scan).
 */
export async function executeLogisticsScan({
  orderId,
  barcode,
  actor,
}: {
  orderId: string;
  barcode: string;
  actor: AuthenticatedActor;
}): Promise<LogisticsScanExecuteResult> {
  const normalizedBarcode = normalizeScanBarcode(barcode);
  return db.transaction(async (tx) => {
    const order = await tx.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });
    if (!order) return { kind: "order_not_found" };
    if (!order.isLogisticsGate) return { kind: "not_gate_order" };

    const project = await tx.query.projects.findFirst({
      where: eq(projects.id, order.projectId),
      columns: { approvalStatus: true },
    });
    if (!project || project.approvalStatus !== "pending_logistics") {
      return { kind: "wrong_project_status" };
    }

    const fkUserId = actor.isPrintedScan ? null : actor.userId;

    const items = await tx.query.orderItems.findMany({
      where: eq(orderItems.orderId, orderId),
    });

    const { outcome, nextStatus } = resolveLogisticsScan({
      barcode: normalizedBarcode,
      items,
      orderStatus: order.status,
    });

    let updatedOrder = order;
    if (nextStatus && nextStatus !== order.status) {
      const [row] = await tx
        .update(orders)
        .set({ status: nextStatus })
        .where(eq(orders.id, orderId))
        .returning();
      updatedOrder = row!;
    }

    let stockAfter: { sku: string; stockQuantity: number } | undefined;

    if (outcome.result === "valid") {
      const matched = items.find((i) => i.id === outcome.itemId)!;
      const sku = matched.productId;

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

      await tx.insert(stockMovements).values({
        productId: prodRow.id,
        delta: -1,
        reason: "logistics_scan",
        orderId,
        orderItemId: outcome.itemId,
        userId: fkUserId,
      });

      stockAfter = { sku, stockQuantity: prodRow.stock };

      await tx
        .update(orderItems)
        .set({
          logisticsScannedAt: new Date(),
          logisticsScannedBy: actor.name,
          logisticsScannedById: fkUserId,
        })
        .where(eq(orderItems.id, outcome.itemId));
    }

    const freshItems = await tx.query.orderItems.findMany({
      where: eq(orderItems.orderId, orderId),
    });

    return {
      kind: "ok",
      outcome,
      order: updatedOrder,
      progress: computeLogisticsProgress(freshItems),
      stock: stockAfter,
    };
  });
}
