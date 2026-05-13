import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { orderItems, orders, projects } from '@/db/schema';
import { requireUser, requireUserAny } from '@/lib/auth-guard';
import { handleError, jsonError } from '@/lib/api';
import {
  printedScanTokenTtlMs,
  signPrintedScanToken,
} from '@/lib/printed-scan-token';
import { computeProgress } from '@/lib/scan';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ('error' in auth) return auth.error;
  try {
    const { id } = await params;
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, id),
    });
    if (!order) return jsonError(404, 'Order not found');

    const [project, items] = await Promise.all([
      db.query.projects.findFirst({ where: eq(projects.id, order.projectId) }),
      db.query.orderItems.findMany({
        where: eq(orderItems.orderId, id),
        orderBy: [asc(orderItems.createdAt)],
      }),
    ]);

    if (
      auth.actor.role === "installer" &&
      project?.approvalStatus !== "active"
    ) {
      return jsonError(
        403,
        "This order is not available until logistics activates the project.",
      );
    }

    const isRestrictedGate =
      order.isLogisticsGate &&
      project?.approvalStatus === "pending_logistics";

    if (
      isRestrictedGate &&
      auth.actor.role !== "logistics" &&
      auth.actor.role !== "super_admin"
    ) {
      return jsonError(
        403,
        "This shipment is still in warehouse verification. Use the logistics scan flow.",
      );
    }
    // self-authorising. Bound to one barcode each — a leaked sticker
    // can only acknowledge that one item, never log in or scan others.
    const ttl = printedScanTokenTtlMs();
    const itemsOut = items.map((item) => ({
      ...item,
      printedScanToken: signPrintedScanToken(item.barcode, ttl),
    }));

    return NextResponse.json({
      order,
      project,
      items: itemsOut,
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
  const auth = await requireUserAny(['pm', 'super_admin']);
  if ('error' in auth) return auth.error;
  try {
    const { id } = await params;
    const order = await db.query.orders.findFirst({ where: eq(orders.id, id) });
    if (!order) return jsonError(404, 'Order not found');

    if (order.isLogisticsGate) {
      return jsonError(
        400,
        "This order is the logistics gate shipment for its project. It cannot be deleted from here.",
      );
    }

    const existingItems = await db.query.orderItems.findMany({
      where: eq(orderItems.orderId, id),
    });
    if (existingItems.some((i) => i.scannedAt !== null)) {
      return jsonError(
        400,
        'Cannot delete an order once any item has been scanned',
      );
    }

    await db.delete(orders).where(eq(orders.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
