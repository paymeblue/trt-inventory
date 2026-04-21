import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, products, stockMovements } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    sku: z.string().trim().min(1).max(80).optional(),
    delta: z.number().int().optional(),
    reason: z.string().trim().min(1).max(80).optional(),
  })
  .refine(
    (v) => v.name !== undefined || v.sku !== undefined || v.delta !== undefined,
    { message: "Provide at least one of name, sku, delta" },
  );

/**
 * PATCH /api/projects/[id]/items/[itemId]
 * Supports three edit modes in one endpoint (kept merged to minimise
 * round-trips from the detail page):
 *   - rename: { name, sku? }
 *   - restock / deplete: { delta, reason? }
 * Renaming the SKU is blocked once the item has been used in any order
 * (because order_items.product_id is a text snapshot — renaming would
 * decouple audit trails).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const auth = await requireUser("pm");
  if ("error" in auth) return auth.error;
  try {
    const { id: projectId, itemId } = await params;
    const body = patchSchema.parse(await req.json());

    const item = await db.query.products.findFirst({
      where: and(
        eq(products.id, itemId),
        eq(products.projectId, projectId),
      ),
    });
    if (!item) return jsonError(404, "Item not found in this project");

    if (body.sku && body.sku !== item.sku) {
      const used = await db.query.orderItems.findFirst({
        where: eq(orderItems.productId, item.sku),
      });
      if (used) {
        return jsonError(
          409,
          "Cannot rename SKU after it has been used in an order. Create a new item instead.",
        );
      }
      const clash = await db.query.products.findFirst({
        where: and(
          eq(products.projectId, projectId),
          sql`lower(${products.sku}) = lower(${body.sku})`,
          ne(products.id, itemId),
        ),
      });
      if (clash) {
        return jsonError(
          409,
          `SKU "${body.sku}" already exists in this project`,
        );
      }
    }

    const updates: Partial<typeof products.$inferInsert> = {};
    if (body.name) updates.name = body.name;
    if (body.sku) updates.sku = body.sku;
    if (body.delta !== undefined && body.delta !== 0) {
      updates.stockQuantity = item.stockQuantity + body.delta;
    }

    const [updated] = await db
      .update(products)
      .set(updates)
      .where(eq(products.id, itemId))
      .returning();

    if (body.delta !== undefined && body.delta !== 0) {
      await db.insert(stockMovements).values({
        productId: itemId,
        delta: body.delta,
        reason: body.reason ?? (body.delta > 0 ? "restock" : "adjustment"),
        userId: auth.actor.userId,
      });
    }

    return NextResponse.json({ item: updated });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * DELETE /api/projects/[id]/items/[itemId]
 * Refuses to delete an item that's referenced by any order, so existing
 * order history stays intact. Unused items can be deleted freely.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const auth = await requireUser("pm");
  if ("error" in auth) return auth.error;
  try {
    const { id: projectId, itemId } = await params;

    const item = await db.query.products.findFirst({
      where: and(
        eq(products.id, itemId),
        eq(products.projectId, projectId),
      ),
    });
    if (!item) return jsonError(404, "Item not found in this project");

    const used = await db.query.orderItems.findFirst({
      where: eq(orderItems.productId, item.sku),
    });
    if (used) {
      return jsonError(
        409,
        "Cannot delete an item that's referenced by an order. Remove those orders first.",
      );
    }

    await db.delete(products).where(eq(products.id, itemId));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
