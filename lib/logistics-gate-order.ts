import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders, products } from "@/db/schema";
import {
  insertOrderItemLine,
  insertOrderItemLinesForSku,
  type OrderItemInserter,
} from "@/lib/order-item-line";
import { packingLineCountForStock } from "@/lib/packing-lines";

/** Transaction (or db) with Drizzle `query` for product listing. */
export type LogisticsGateDb = OrderItemInserter & {
  query: typeof db.query;
};

export async function findLogisticsGateOrderId(
  projectId: string,
): Promise<string | null> {
  const row = await db.query.orders.findFirst({
    where: and(
      eq(orders.projectId, projectId),
      eq(orders.isLogisticsGate, true),
    ),
    columns: { id: true },
  });
  return row?.id ?? null;
}

export async function ensureLogisticsGateOrder(
  tx: LogisticsGateDb,
  params: {
    projectId: string;
    createdBy: string;
    createdById: string | null;
  },
) {
  const existing = await tx.query.orders.findFirst({
    where: and(
      eq(orders.projectId, params.projectId),
      eq(orders.isLogisticsGate, true),
    ),
  });
  if (existing) {
    await syncLogisticsGateOrderLines(tx, existing.id, params.projectId);
    return existing;
  }
  const seeded = await seedLogisticsGateOrder(tx, params);
  await syncLogisticsGateOrderLines(tx, seeded.id, params.projectId);
  return seeded;
}

/**
 * Adds missing packing lines when inventory grew after the gate order was first
 * created (e.g. SA approved before all SKUs were on the project).
 */
export async function syncLogisticsGateOrderLines(
  tx: LogisticsGateDb,
  gateOrderId: string,
  projectId: string,
) {
  const [prods, items] = await Promise.all([
    tx.query.products.findMany({
      where: eq(products.projectId, projectId),
      orderBy: [asc(products.sku)],
    }),
    tx.query.orderItems.findMany({
      where: eq(orderItems.orderId, gateOrderId),
    }),
  ]);

  for (const p of prods) {
    const required = packingLineCountForStock(p.stockQuantity);
    const existingForSku = items.filter((i) => i.productId === p.sku).length;
    const toAdd = required - existingForSku;
    for (let i = 0; i < toAdd; i++) {
      await insertOrderItemLine(tx, gateOrderId, p.sku);
    }
  }
}

/**
 * Seeds the per-project logistics gate order: `stock_quantity` barcode lines
 * per SKU (same rules as PM “new order”). Installers reuse those stickers on site.
 */
export async function seedLogisticsGateOrder(
  tx: LogisticsGateDb,
  params: {
    projectId: string;
    createdBy: string;
    createdById: string | null;
  },
) {
  const [orderRow] = await tx
    .insert(orders)
    .values({
      projectId: params.projectId,
      createdBy: params.createdBy,
      createdById: params.createdById,
      status: "active",
      isLogisticsGate: true,
    })
    .returning();

  const prods = await tx.query.products.findMany({
    where: eq(products.projectId, params.projectId),
    orderBy: [asc(products.sku)],
  });

  for (const p of prods) {
    await insertOrderItemLinesForSku(tx, orderRow.id, p.sku, p.stockQuantity);
  }

  return orderRow;
}
