import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders, products } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { insertOrderItemLine } from "@/lib/order-item-line";
import { handleError, jsonError } from "@/lib/api";

const addItemSchema = z.object({
  productId: z.string().trim().min(1, "productId required").max(80),
});

/**
 * POST /api/orders/[id]/items → append an item line to an order by SKU.
 *
 * The SKU must exist inside the order's own project — cross-project
 * item reuse is rejected, which is the invariant that makes items
 * "unique to a project".
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser("pm");
  if ("error" in auth) return auth.error;
  try {
    const { id } = await params;
    const { productId } = addItemSchema.parse(await req.json());

    const order = await db.query.orders.findFirst({ where: eq(orders.id, id) });
    if (!order) return jsonError(404, "Order not found");
    if (order.status === "fulfilled") {
      return jsonError(400, "Cannot add items to a fulfilled order");
    }

    const existingItems = await db.query.orderItems.findMany({
      where: eq(orderItems.orderId, id),
    });
    if (existingItems.some((i) => i.scannedAt !== null)) {
      return jsonError(
        400,
        "Cannot add items after scanning has started. Create a new order.",
      );
    }

    const product = await db.query.products.findFirst({
      where: and(
        eq(products.projectId, order.projectId),
        eq(products.sku, productId),
      ),
    });
    if (!product) {
      return jsonError(
        400,
        `SKU "${productId}" does not exist in this project. Add it to the project's items first.`,
      );
    }

    const existing = await db.query.orderItems.findFirst({
      where: and(eq(orderItems.orderId, id), eq(orderItems.productId, productId)),
    });
    if (existing) {
      return jsonError(409, `SKU "${productId}" is already in this order`);
    }

    const [row] = await insertOrderItemLine(db, id, productId);
    return NextResponse.json(
      {
        item: row,
        product: {
          sku: product.sku,
          name: product.name,
          stockQuantity: product.stockQuantity,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser("pm");
  if ("error" in auth) return auth.error;
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const itemId = url.searchParams.get("itemId");
    if (!itemId) return jsonError(400, "itemId query param required");

    const order = await db.query.orders.findFirst({ where: eq(orders.id, id) });
    if (!order) return jsonError(404, "Order not found");
    if (order.status === "fulfilled") {
      return jsonError(400, "Cannot remove items from a fulfilled order");
    }

    const target = await db.query.orderItems.findFirst({
      where: and(eq(orderItems.id, itemId), eq(orderItems.orderId, id)),
    });
    if (target?.scannedAt) {
      return jsonError(400, "Cannot remove an item that has already been scanned");
    }

    await db
      .delete(orderItems)
      .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, id)));

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
