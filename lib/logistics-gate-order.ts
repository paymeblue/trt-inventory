import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, products } from "@/db/schema";
import { insertOrderItemLine, type OrderItemInserter } from "@/lib/order-item-line";

/** Transaction (or db) with Drizzle `query` for product listing. */
export type LogisticsGateDb = OrderItemInserter & {
  query: typeof db.query;
};

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
  if (existing) return existing;
  return seedLogisticsGateOrder(tx, params);
}

/**
 * Seeds the per-project logistics gate order: one barcode per SKU (same snapshot
 * as PM “new order”). Installers reuse these stickers later for site scans.
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
    await insertOrderItemLine(tx, orderRow.id, p.sku);
  }

  return orderRow;
}
