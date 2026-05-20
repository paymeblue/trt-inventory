import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders, products, stockMovements } from "@/db/schema";
import type { PendingItemChange } from "@/lib/project-pending-patch";

type DbTx = Pick<typeof db, "select" | "update" | "insert" | "delete" | "query">;

async function isSkuUsedInProject(
  tx: DbTx,
  projectId: string,
  sku: string,
) {
  const [row] = await tx
    .select({ id: orderItems.id })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(eq(orders.projectId, projectId), eq(orderItems.productId, sku)),
    )
    .limit(1);
  return !!row;
}

/**
 * Applies queued item renames, stock adjustments, and deletes when logistics confirms.
 */
export async function applyPendingItemChanges(
  tx: DbTx,
  params: {
    projectId: string;
    userId: string;
    changes: PendingItemChange[];
  },
) {
  for (const change of params.changes) {
    const item = await tx.query.products.findFirst({
      where: and(
        eq(products.id, change.itemId),
        eq(products.projectId, params.projectId),
      ),
    });
    if (!item) continue;

    if (change.delete) {
      if (await isSkuUsedInProject(tx, params.projectId, item.sku)) {
        throw new Error(
          `Cannot delete item ${item.sku}: it is referenced by an order.`,
        );
      }
      await tx.delete(products).where(eq(products.id, change.itemId));
      continue;
    }

    if (change.sku && change.sku !== item.sku) {
      if (await isSkuUsedInProject(tx, params.projectId, item.sku)) {
        throw new Error(
          `Cannot rename SKU ${item.sku} after it has been used in an order.`,
        );
      }
      const clash = await tx.query.products.findFirst({
        where: and(
          eq(products.projectId, params.projectId),
          sql`lower(${products.sku}) = lower(${change.sku})`,
          ne(products.id, change.itemId),
        ),
      });
      if (clash) {
        throw new Error(`SKU "${change.sku}" already exists in this project`);
      }
    }

    const updates: Partial<typeof products.$inferInsert> = {};
    if (change.name) updates.name = change.name;
    if (change.sku) updates.sku = change.sku;

    if (change.delta !== undefined && change.delta !== 0) {
      const nextQty = item.stockQuantity + change.delta;
      if (nextQty < 1) {
        throw new Error(
          `Stock for ${item.sku} must stay at least 1 after the queued adjustment.`,
        );
      }
      updates.stockQuantity = nextQty;
    }

    if (Object.keys(updates).length === 0) continue;

    const [updated] = await tx
      .update(products)
      .set(updates)
      .where(eq(products.id, change.itemId))
      .returning();

    if (change.delta !== undefined && change.delta !== 0 && updated) {
      await tx.insert(stockMovements).values({
        productId: change.itemId,
        delta: change.delta,
        reason: change.reason ?? (change.delta > 0 ? "restock" : "adjustment"),
        userId: params.userId,
      });
    }
  }
}
