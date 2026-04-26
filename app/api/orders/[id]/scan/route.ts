import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";
import { instrumentRouteHandler } from "@/lib/observability/instrument";
import { executeScan } from "@/lib/scan-execute";

const scanSchema = z.object({
  barcode: z.string().trim().min(1),
});

async function handlePost(
  req: NextRequest,
  ctx?: { params: Promise<{ id: string }> },
) {
  if (!ctx) return jsonError(500, "Missing route context");
  const auth = await requireUser("installer");
  if ("error" in auth) return auth.error;
  try {
    const { id } = await ctx.params;
    const { barcode } = scanSchema.parse(await req.json());

    const result = await executeScan({
      orderId: id,
      barcode,
      actor: auth.actor,
    });

    if (result.kind === "order_not_found") {
      return jsonError(404, "Order not found");
    }
    if (result.kind === "order_fulfilled") {
      return jsonError(400, "Order is already fully fulfilled");
    }
    if (result.kind === "sku_deleted") {
      return jsonError(
        409,
        `Item SKU "${result.sku}" no longer exists in this project. Recreate it or rebuild the order.`,
      );
    }
    if (result.kind === "insufficient_stock") {
      return jsonError(
        409,
        `No on-hand stock left for SKU "${result.sku}". Add stock on the project before verifying this line.`,
      );
    }

    return NextResponse.json({
      outcome: result.outcome,
      order: result.order,
      progress: result.progress,
      stock: result.stock,
    });
  } catch (err) {
    return handleError(err);
  }
}

export const POST = instrumentRouteHandler(
  "POST /api/orders/[id]/scan",
  handlePost,
);
