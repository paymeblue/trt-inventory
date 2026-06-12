import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { projects, users } from "@/db/schema";
import { requireUserAny } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";
import { instrumentRouteHandler } from "@/lib/observability/instrument";
import { resolveOnSiteScanTarget } from "@/lib/resolve-onsite-scan";
import { executeScan } from "@/lib/scan-execute";

const scanSchema = z.object({
  barcode: z.string().trim().min(1),
});

async function handlePost(
  req: NextRequest,
  ctx?: { params: Promise<{ id: string }> },
) {
  if (!ctx) return jsonError(500, "Missing route context");
  // Fulfillment is the receiver's job; super-admin can always override.
  const auth = await requireUserAny(["installer", "super_admin"]);
  if ("error" in auth) return auth.error;
  try {
    const body = scanSchema.parse(await req.json());

    const target = await resolveOnSiteScanTarget(body.barcode);
    if (!target) {
      return jsonError(
        404,
        "This sticker is not on an open delivery line. It may already be verified on site, or the code is not in this workspace.",
      );
    }
    if (target.orderIsLogisticsGate) {
      return jsonError(
        403,
        "This shipment is for warehouse verification only. Receivers fulfill PM delivery orders on site, not the logistics gate list.",
      );
    }

    const result = await executeScan({
      orderId: target.orderId,
      barcode: target.itemBarcode,
      actor: auth.actor,
    });

    if (result.kind === "order_not_found") {
      return jsonError(404, "Order not found");
    }
    if (result.kind === "order_fulfilled") {
      return jsonError(400, "Order is already fully fulfilled");
    }
    if (result.kind === "not_delivery_order") {
      return jsonError(
        403,
        "This shipment is for warehouse verification only. Receivers fulfill PM delivery orders on site, not the logistics gate list.",
      );
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
      const projectRow = await db.query.projects.findFirst({
        where: eq(projects.id, target.projectId),
        columns: { createdById: true },
      });
      const pm = projectRow?.createdById
        ? await db.query.users.findFirst({
            where: eq(users.id, projectRow.createdById),
            columns: { name: true, phone: true, email: true },
          })
        : null;
      const parts: string[] = [];
      parts.push(
        result.assignedInstallerName
          ? `This project was assigned to ${result.assignedInstallerName}, not you.`
          : "Only the assigned receiver can fulfill this order.",
      );
      if (pm?.phone) parts.push(`Please contact the PM on ${pm.phone}`);
      if (pm?.email) {
        parts.push(pm.phone ? `or email ${pm.email}.` : `Please email the PM at ${pm.email}.`);
      } else {
        parts.push("Please contact your PM.");
      }
      return jsonError(403, parts.join(" "));
    }

    if (result.kind === "logistics_not_verified") {
      return jsonError(
        403,
        `This project hasn't been activated for on-site fulfillment yet (SKU ${result.sku}). Ask the PM to check that logistics has finished Warehouse scan and approved the project.`,
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
