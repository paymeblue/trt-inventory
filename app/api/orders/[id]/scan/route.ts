import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";
import { executeScan } from "@/lib/scan-execute";

const scanSchema = z.object({
  barcode: z.string().trim().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser("installer");
  if ("error" in auth) return auth.error;
  try {
    const { id } = await params;
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
