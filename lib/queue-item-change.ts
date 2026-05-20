import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders, products, projects } from "@/db/schema";
import { METADATA_PENDING_SUPER_ADMIN } from "@/lib/metadata-stages";
import { projectLivesOnSite } from "@/lib/project-live";
import {
  mergeItemChangeIntoPatch,
  type PendingItemChange,
} from "@/lib/project-pending-patch";

async function isSkuUsedInProject(projectId: string, sku: string) {
  const [row] = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(eq(orders.projectId, projectId), eq(orderItems.productId, sku)),
    )
    .limit(1);
  return !!row;
}

export async function queueItemChangeIfLive(
  projectId: string,
  change: PendingItemChange,
) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });
  if (!project) return { ok: false as const, status: 404, error: "Project not found" };

  if (!projectLivesOnSite(project.approvalStatus)) {
    return { ok: false as const, status: null, error: null };
  }

  const item = await db.query.products.findFirst({
    where: and(eq(products.id, change.itemId), eq(products.projectId, projectId)),
  });
  if (!item) {
    return { ok: false as const, status: 404, error: "Item not found in this project" };
  }

  if (change.delete) {
    if (await isSkuUsedInProject(projectId, item.sku)) {
      return {
        ok: false as const,
        status: 409,
        error:
          "Cannot delete an item that's referenced by an order. Remove those orders first.",
      };
    }
  } else {
    if (change.sku && change.sku !== item.sku) {
      if (await isSkuUsedInProject(projectId, item.sku)) {
        return {
          ok: false as const,
          status: 409,
          error:
            "Cannot rename SKU after it has been used in an order. Create a new item instead.",
        };
      }
      const clash = await db.query.products.findFirst({
        where: and(
          eq(products.projectId, projectId),
          sql`lower(${products.sku}) = lower(${change.sku})`,
          ne(products.id, change.itemId),
        ),
      });
      if (clash) {
        return {
          ok: false as const,
          status: 409,
          error: `SKU "${change.sku}" already exists in this project`,
        };
      }
    }

    if (change.delta !== undefined && change.delta !== 0) {
      const nextQty = item.stockQuantity + change.delta;
      if (nextQty < 1) {
        return {
          ok: false as const,
          status: 400,
          error:
            "Stock must stay at least 1. Reduce the amount or delete the item if it is obsolete.",
        };
      }
    }

    const hasWork =
      (change.name !== undefined && change.name !== item.name) ||
      (change.sku !== undefined && change.sku !== item.sku) ||
      (change.delta !== undefined && change.delta !== 0);
    if (!hasWork) {
      return {
        ok: false as const,
        status: 400,
        error: "No changes to submit for approval",
      };
    }
  }

  const merged = mergeItemChangeIntoPatch(project.pendingPatch, change);
  const [updated] = await db
    .update(projects)
    .set({
      pendingPatch: merged,
      metadataChangeStage: METADATA_PENDING_SUPER_ADMIN,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId))
    .returning();

  return { ok: true as const, project: updated };
}
