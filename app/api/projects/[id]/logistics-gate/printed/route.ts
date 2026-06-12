import { NextResponse, type NextRequest } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { orderItems, orders } from "@/db/schema";
import { requireUserAny } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";

const bodySchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(500),
});

/**
 * POST /api/projects/[id]/logistics-gate/printed — PM marks the selected
 * packing labels as printed so the print-barcodes page can decrement the
 * remaining-to-print count. Stickers are a PM / super-admin concern only.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUserAny(["pm", "super_admin"]);
  if ("error" in auth) return auth.error;
  try {
    const { id: projectId } = await params;
    const body = bodySchema.parse(await req.json());

    const gateOrder = await db.query.orders.findFirst({
      where: and(
        eq(orders.projectId, projectId),
        eq(orders.isLogisticsGate, true),
      ),
      columns: { id: true },
    });
    if (!gateOrder) {
      return jsonError(404, "No packing labels exist for this project yet.");
    }

    const updated = await db
      .update(orderItems)
      .set({ labelPrintedAt: new Date() })
      .where(
        and(
          eq(orderItems.orderId, gateOrder.id),
          inArray(orderItems.id, body.itemIds),
        ),
      )
      .returning({ id: orderItems.id });

    if (updated.length === 0) {
      return jsonError(404, "None of those labels belong to this project.");
    }

    return NextResponse.json({ printed: updated.length });
  } catch (err) {
    return handleError(err);
  }
}
