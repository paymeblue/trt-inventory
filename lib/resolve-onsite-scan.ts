import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders, projects } from "@/db/schema";
import type { ProjectApprovalStatus } from "@/db/schema";
import { normalizeScanBarcode } from "@/lib/scan-deep-link";
import { projectReadyForOnSiteVerification } from "@/lib/project-live";

export type BarcodeLookupRow = {
  itemId: string;
  itemBarcode: string;
  itemScannedAt: Date | null;
  orderId: string;
  orderStatus: string;
  orderIsLogisticsGate: boolean;
  productId: string;
  projectId: string;
  projectName: string;
  projectApprovalStatus: ProjectApprovalStatus;
};

export type OnSiteScanTarget = BarcodeLookupRow & {
  /** Physical sticker was on the warehouse gate list; applied to a delivery line. */
  matchedViaGateSticker: boolean;
};

export async function findRowsByBarcode(
  barcode: string,
): Promise<BarcodeLookupRow[]> {
  const normalized = normalizeScanBarcode(barcode);
  return db
    .select({
      itemId: orderItems.id,
      itemBarcode: orderItems.barcode,
      itemScannedAt: orderItems.scannedAt,
      orderId: orders.id,
      orderStatus: orders.status,
      orderIsLogisticsGate: orders.isLogisticsGate,
      productId: orderItems.productId,
      projectId: orders.projectId,
      projectName: projects.name,
      projectApprovalStatus: projects.approvalStatus,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(projects, eq(projects.id, orders.projectId))
    .where(sql`lower(${orderItems.barcode}) = lower(${normalized})`)
    .orderBy(asc(orders.isLogisticsGate), asc(orderItems.createdAt));
}

/**
 * Finds the next unscanned delivery-order line for a SKU on an active project.
 */
export async function findDeliveryLineForSku(
  projectId: string,
  sku: string,
): Promise<BarcodeLookupRow | null> {
  const [row] = await db
    .select({
      itemId: orderItems.id,
      itemBarcode: orderItems.barcode,
      itemScannedAt: orderItems.scannedAt,
      orderId: orders.id,
      orderStatus: orders.status,
      orderIsLogisticsGate: orders.isLogisticsGate,
      productId: orderItems.productId,
      projectId: orders.projectId,
      projectName: projects.name,
      projectApprovalStatus: projects.approvalStatus,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(projects, eq(projects.id, orders.projectId))
    .where(
      and(
        eq(orders.projectId, projectId),
        eq(orders.isLogisticsGate, false),
        eq(orders.status, "active"),
        eq(orderItems.productId, sku),
        isNull(orderItems.scannedAt),
      ),
    )
    .orderBy(asc(orders.createdAt), asc(orderItems.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Resolves a scanned sticker to the delivery order line receivers should fulfill.
 * Warehouse gate stickers (same QR logistics scanned) map to the next open
 * delivery line for that SKU once the project is active.
 */
export async function resolveOnSiteScanTarget(
  barcodeRaw: string,
): Promise<OnSiteScanTarget | null> {
  const barcode = normalizeScanBarcode(barcodeRaw);
  if (!barcode) return null;

  const rows = await findRowsByBarcode(barcode);
  if (rows.length === 0) return null;

  const deliveryHit = rows.find((r) => !r.orderIsLogisticsGate);
  if (deliveryHit) {
    return { ...deliveryHit, matchedViaGateSticker: false };
  }

  const gateHit = rows[0]!;
  if (
    projectReadyForOnSiteVerification(gateHit.projectApprovalStatus)
  ) {
    const deliveryLine = await findDeliveryLineForSku(
      gateHit.projectId,
      gateHit.productId,
    );
    if (deliveryLine) {
      return { ...deliveryLine, matchedViaGateSticker: true };
    }
  }

  return { ...gateHit, matchedViaGateSticker: false };
}

/** @deprecated Prefer resolveOnSiteScanTarget for receiver flows. */
export async function findOrderByBarcode(barcode: string) {
  const target = await resolveOnSiteScanTarget(barcode);
  if (!target) return null;
  return {
    itemId: target.itemId,
    itemBarcode: target.itemBarcode,
    itemScannedAt: target.itemScannedAt,
    orderId: target.orderId,
    orderStatus: target.orderStatus,
    orderIsLogisticsGate: target.orderIsLogisticsGate,
    projectId: target.projectId,
    projectName: target.projectName,
    projectApprovalStatus: target.projectApprovalStatus,
  };
}
