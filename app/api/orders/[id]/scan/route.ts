import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";
import { instrumentRouteHandler } from "@/lib/observability/instrument";
import { executeScan } from "@/lib/scan-execute";

const scanSchema = z.object({
  barcode: z.string().trim().min(1),
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
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
    const body = scanSchema.parse(await req.json());
    const scanLocation =
      body.latitude !== undefined && body.longitude !== undefined
        ? { latitude: body.latitude, longitude: body.longitude }
        : undefined;

    const result = await executeScan({
      orderId: id,
      barcode: body.barcode,
      actor: auth.actor,
      scanLocation,
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
    if (result.kind === "installer_not_assigned") {
      return jsonError(
        403,
        "Only the installer assigned to this project may verify with this login. Use the sticker QR on the box, or ask your PM to assign you.",
      );
    }

    if (result.kind === "logistics_not_verified") {
      return jsonError(
        403,
        `Logistics must scan this item at the warehouse first (SKU ${result.sku}). Open the project's logistics scanning page.`,
      );
    }
    if (result.kind === "geofence_location_required") {
      return jsonError(
        403,
        "Turn on location for this device. Scans must be recorded at the project site.",
      );
    }
    if (result.kind === "geofence_violation") {
      return jsonError(
        403,
        `You are about ${result.distanceMeters} m from the project site (limit ${result.radiusMeters} m). Move to the correct location to scan.`,
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
