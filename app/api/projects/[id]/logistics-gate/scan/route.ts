import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { requireUserAny } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";
import { instrumentRouteHandler } from "@/lib/observability/instrument";
import { executeLogisticsScan } from "@/lib/logistics-scan-execute";
import { normalizeScanBarcode } from "@/lib/scan-deep-link";

const bodySchema = z.object({
  barcode: z.string().trim().min(1),
});

async function handlePost(
  req: NextRequest,
  ctx?: { params: Promise<{ id: string }> },
) {
  if (!ctx) return jsonError(500, "Missing route context");
  // Warehouse verification is a logistics duty; super-admin can override.
  const auth = await requireUserAny(["logistics", "super_admin"]);
  if ("error" in auth) return auth.error;

  try {
    const { id: projectId } = await ctx.params;
    const body = bodySchema.parse(await req.json());
    const barcode = normalizeScanBarcode(body.barcode);
    if (!barcode) {
      return jsonError(400, "Enter a packing sticker barcode (TRT-…), not the project reference code.");
    }

    const gateOrder = await db.query.orders.findFirst({
      where: and(
        eq(orders.projectId, projectId),
        eq(orders.isLogisticsGate, true),
      ),
    });

    if (!gateOrder) {
      return jsonError(
        404,
        "No logistics gate shipment found for this project. Refresh the page.",
      );
    }

    const result = await executeLogisticsScan({
      orderId: gateOrder.id,
      barcode,
      actor: auth.actor,
    });

    if (result.kind === "order_not_found") {
      return jsonError(404, "Gate order missing");
    }
    if (result.kind === "not_gate_order") {
      return jsonError(409, "This order is not a logistics gate shipment");
    }
    if (result.kind === "wrong_project_status") {
      return jsonError(
        400,
        "This project is no longer waiting for logistics verification.",
      );
    }
    return NextResponse.json({
      outcome: result.outcome,
      order: result.order,
      progress: result.progress,
    });
  } catch (err) {
    return handleError(err);
  }
}

export const POST = instrumentRouteHandler(
  "POST /api/projects/[id]/logistics-gate/scan",
  handlePost,
);
