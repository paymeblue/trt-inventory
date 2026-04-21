import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders, projects } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";
import { computeProgress } from "@/lib/scan";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  try {
    const { id } = await params;
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, id),
    });
    if (!order) return jsonError(404, "Order not found");

    const [project, items] = await Promise.all([
      db.query.projects.findFirst({ where: eq(projects.id, order.projectId) }),
      db.query.orderItems.findMany({
        where: eq(orderItems.orderId, id),
        orderBy: [asc(orderItems.createdAt)],
      }),
    ]);

    return NextResponse.json({
      order,
      project,
      items,
      progress: computeProgress(items),
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser("pm");
  if ("error" in auth) return auth.error;
  try {
    const { id } = await params;
    const order = await db.query.orders.findFirst({ where: eq(orders.id, id) });
    if (!order) return jsonError(404, "Order not found");

    const existingItems = await db.query.orderItems.findMany({
      where: eq(orderItems.orderId, id),
    });
    if (existingItems.some((i) => i.scannedAt !== null)) {
      return jsonError(
        400,
        "Cannot delete an order once any item has been scanned",
      );
    }

    await db.delete(orders).where(eq(orders.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
