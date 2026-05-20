import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders, projects } from "@/db/schema";
import { requireUserAny } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";
import { ensureLogisticsGateOrder } from "@/lib/logistics-gate-order";
import {
  printedScanTokenTtlMs,
  signPrintedScanToken,
} from "@/lib/printed-scan-token";
import { computeLogisticsProgress } from "@/lib/scan";

type OrderItemOut = (typeof orderItems.$inferSelect) & {
  printedScanToken?: string;
};

/**
 * GET /api/projects/[id]/logistics-gate — gate order + sticker tokens for
 * warehouse scans while the project is pending_logistics.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUserAny(["logistics", "super_admin"]);
  if ("error" in auth) return auth.error;
  try {
    const { id: projectId } = await params;

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });
    if (!project) return jsonError(404, "Project not found");
    if (project.approvalStatus !== "pending_logistics") {
      return jsonError(
        400,
        "This project is not waiting for logistics scanning.",
      );
    }

    const gate = await db.transaction(async (tx) =>
      ensureLogisticsGateOrder(tx, {
        projectId,
        createdBy: auth.actor.name,
        createdById: auth.actor.userId,
      }),
    );

    const items = await db.query.orderItems.findMany({
      where: eq(orderItems.orderId, gate.id),
      orderBy: [asc(orderItems.createdAt)],
    });

    const ttl = printedScanTokenTtlMs();
    const itemsOut: OrderItemOut[] = items.map((item) => ({
      ...item,
      printedScanToken: signPrintedScanToken(item.barcode, ttl),
    }));

    return NextResponse.json({
      order: gate,
      project,
      items: itemsOut,
      progress: computeLogisticsProgress(items),
    });
  } catch (err) {
    return handleError(err);
  }
}
