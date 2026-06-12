import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { orders, products, projects } from "@/db/schema";
import { requireUserAny } from "@/lib/auth-guard";
import { generateBarcode } from "@/lib/barcode";
import { handleError, jsonError } from "@/lib/api";
import { applyPendingCategoryAdds } from "@/lib/apply-pending-category-adds";
import { applyPendingItemChanges } from "@/lib/apply-pending-item-changes";
import { ensureLogisticsGateOrder } from "@/lib/logistics-gate-order";
import {
  METADATA_PENDING_LOGISTICS,
  METADATA_PENDING_SUPER_ADMIN,
} from "@/lib/metadata-stages";
import {
  pendingPatchHasWork,
  type ProjectPendingPatch,
} from "@/lib/project-pending-patch";

const bodySchema = z.object({
  action: z.enum([
    "super_admin_approve",
    "super_admin_reject",
    "super_admin_approve_metadata_change",
    "super_admin_reject_metadata_change",
    "logistics_fulfill",
    "logistics_reject",
    "logistics_apply_patch",
    "logistics_reject_metadata_change",
    "discard_pending_patch",
  ]),
});

function effectivePendingPatch(raw: unknown): ProjectPendingPatch | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as ProjectPendingPatch;
  return pendingPatchHasWork(o) ? o : null;
}

/**
 * POST /api/projects/[id]/approval — workflow transitions and patch flow.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = bodySchema.parse(await req.json());

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, id),
    });
    if (!project) return jsonError(404, "Project not found");

    if (body.action === "super_admin_approve") {
      const auth = await requireUserAny(["super_admin"]);
      if ("error" in auth) return auth.error;
      if (project.approvalStatus !== "pending_super_admin") {
        return jsonError(400, "Project is not waiting for super-admin approval");
      }
      let barcode = project.projectBarcode;
      if (!barcode) {
        for (let i = 0; i < 5; i++) {
          const cand = generateBarcode();
          const clash = await db.query.projects.findFirst({
            where: eq(projects.projectBarcode, cand),
          });
          if (!clash) {
            barcode = cand;
            break;
          }
        }
        if (!barcode) {
          return jsonError(500, "Could not mint a unique project barcode");
        }
      }
      const updated = await db.transaction(async (tx) => {
        const [proj] = await tx
          .update(projects)
          .set({
            approvalStatus: "pending_logistics",
            projectBarcode: barcode,
            updatedAt: new Date(),
          })
          .where(eq(projects.id, id))
          .returning();
        if (!proj) {
          throw new Error("Project disappeared during approval");
        }
        await ensureLogisticsGateOrder(tx, {
          projectId: id,
          createdBy: auth.actor.name,
          createdById: auth.actor.userId,
        });
        return proj;
      });

      return NextResponse.json({ project: updated });
    }

    if (body.action === "super_admin_reject") {
      const auth = await requireUserAny(["super_admin"]);
      if ("error" in auth) return auth.error;
      if (project.approvalStatus !== "pending_super_admin") {
        return jsonError(400, "Project is not waiting for super-admin approval");
      }
      const [updated] = await db
        .update(projects)
        .set({
          approvalStatus: "rejected_super_admin",
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id))
        .returning();
      return NextResponse.json({ project: updated });
    }

    if (body.action === "super_admin_approve_metadata_change") {
      const auth = await requireUserAny(["super_admin"]);
      if ("error" in auth) return auth.error;
      if (project.metadataChangeStage !== METADATA_PENDING_SUPER_ADMIN) {
        return jsonError(
          400,
          "Nothing is queued for super-admin metadata approval",
        );
      }
      const [updated] = await db
        .update(projects)
        .set({
          metadataChangeStage: METADATA_PENDING_LOGISTICS,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id))
        .returning();
      return NextResponse.json({ project: updated });
    }

    if (body.action === "super_admin_reject_metadata_change") {
      const auth = await requireUserAny(["super_admin"]);
      if ("error" in auth) return auth.error;
      if (
        project.metadataChangeStage !== METADATA_PENDING_SUPER_ADMIN &&
        project.metadataChangeStage !== METADATA_PENDING_LOGISTICS
      ) {
        return jsonError(400, "No pending metadata/delete request");
      }
      const [updated] = await db
        .update(projects)
        .set({
          pendingPatch: null,
          pendingDeleteRequested: false,
          metadataChangeStage: null,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id))
        .returning();
      return NextResponse.json({ project: updated });
    }

    if (body.action === "logistics_fulfill") {
      // Logistics approves after warehouse verification; super-admin can
      // always override.
      const auth = await requireUserAny(["logistics", "super_admin"]);
      if ("error" in auth) return auth.error;
      if (project.approvalStatus !== "pending_logistics") {
        return jsonError(400, "Project is not awaiting logistics fulfillment");
      }

      const skuRows = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.projectId, id));

      if (skuRows.length > 0) {
        let gateOrder = await db.query.orders.findFirst({
          where: and(
            eq(orders.projectId, id),
            eq(orders.isLogisticsGate, true),
          ),
          with: { items: true },
        });
        if (!gateOrder) {
          await db.transaction(async (tx) => {
            await ensureLogisticsGateOrder(tx, {
              projectId: id,
              createdBy: `${auth.actor.name} (gate backfill)`,
              createdById: auth.actor.userId,
            });
          });
          gateOrder = await db.query.orders.findFirst({
            where: and(
              eq(orders.projectId, id),
              eq(orders.isLogisticsGate, true),
            ),
            with: { items: true },
          });
        }

        const lines = gateOrder?.items ?? [];
        const needsWarehouseScans = lines.length > 0;
        if (
          needsWarehouseScans &&
          lines.some(
            (item) =>
              item.logisticsScannedAt === null ||
              item.logisticsScannedAt === undefined,
          )
        ) {
          return jsonError(
            400,
            "Scan every packing QR for this project in the warehouse before activating.",
          );
        }
      }

      const [updated] = await db
        .update(projects)
        .set({
          approvalStatus: "active",
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id))
        .returning();
      if (!updated) {
        return jsonError(500, "Project disappeared during logistics activation");
      }
      return NextResponse.json({ project: updated });
    }

    if (body.action === "logistics_reject") {
      const auth = await requireUserAny(["logistics", "super_admin"]);
      if ("error" in auth) return auth.error;
      if (project.approvalStatus !== "pending_logistics") {
        return jsonError(400, "Project is not awaiting logistics review");
      }
      await db.delete(orders).where(
        and(eq(orders.projectId, id), eq(orders.isLogisticsGate, true)),
      );
      const [updated] = await db
        .update(projects)
        .set({
          approvalStatus: "rejected_logistics",
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id))
        .returning();
      return NextResponse.json({ project: updated });
    }

    if (body.action === "logistics_apply_patch") {
      const auth = await requireUserAny(["logistics", "super_admin"]);
      if ("error" in auth) return auth.error;
      const patch = effectivePendingPatch(project.pendingPatch);
      const wantsDelete = project.pendingDeleteRequested === true;
      const gatedOk =
        project.metadataChangeStage === METADATA_PENDING_LOGISTICS &&
        (patch !== null || wantsDelete);
      const legacyPatchOnly =
        project.metadataChangeStage == null && patch !== null && !wantsDelete;
      if (!gatedOk && !legacyPatchOnly) {
        return jsonError(
          400,
          "No pending edits or deletes for logistics to apply",
        );
      }
      if (wantsDelete && gatedOk) {
        const blocker = await db.query.orders.findFirst({
          where: eq(orders.projectId, id),
        });
        if (blocker) {
          return jsonError(
            409,
            "This project still has orders. Resolve them before confirming delete.",
          );
        }
        await db.delete(projects).where(eq(projects.id, id));
        return NextResponse.json({ deleted: true as const });
      }
      const updated = await db.transaction(async (tx) => {
        if (patch?.categoryAdds?.length) {
          await applyPendingCategoryAdds(tx, {
            projectId: id,
            userId: auth.actor.userId,
            adds: patch.categoryAdds,
          });
        }
        if (patch?.itemChanges?.length) {
          await applyPendingItemChanges(tx, {
            projectId: id,
            userId: auth.actor.userId,
            changes: patch.itemChanges,
          });
        }
        const [proj] = await tx
          .update(projects)
          .set({
            ...(patch?.name !== undefined ? { name: patch.name } : {}),
            ...(patch?.description !== undefined
              ? { description: patch.description }
              : {}),
            ...(patch?.installerUserId !== undefined
              ? { installerUserId: patch.installerUserId }
              : {}),
            ...(patch?.siteAddress !== undefined
              ? { siteAddress: patch.siteAddress }
              : {}),
            ...(patch?.siteLatitude !== undefined
              ? { siteLatitude: patch.siteLatitude }
              : {}),
            ...(patch?.siteLongitude !== undefined
              ? { siteLongitude: patch.siteLongitude }
              : {}),
            ...(patch?.geofenceRadiusMeters !== undefined
              ? { geofenceRadiusMeters: patch.geofenceRadiusMeters }
              : {}),
            pendingPatch: null,
            pendingDeleteRequested: false,
            metadataChangeStage: null,
            updatedAt: new Date(),
          })
          .where(eq(projects.id, id))
          .returning();
        return proj!;
      });
      return NextResponse.json({ project: updated });
    }

    if (body.action === "logistics_reject_metadata_change") {
      const auth = await requireUserAny(["logistics", "super_admin"]);
      if ("error" in auth) return auth.error;
      if (project.metadataChangeStage !== METADATA_PENDING_LOGISTICS) {
        return jsonError(400, "Nothing is queued for logistics to reject");
      }
      const [updated] = await db
        .update(projects)
        .set({
          pendingPatch: null,
          pendingDeleteRequested: false,
          metadataChangeStage: null,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id))
        .returning();
      return NextResponse.json({ project: updated });
    }

    if (body.action === "discard_pending_patch") {
      const auth = await requireUserAny(["pm", "logistics", "super_admin"]);
      if ("error" in auth) return auth.error;
      if (
        auth.actor.role === "pm" &&
        project.metadataChangeStage === METADATA_PENDING_LOGISTICS
      ) {
        return jsonError(
          403,
          "You cannot discard after this has been forwarded to logistics",
        );
      }
      const [updated] = await db
        .update(projects)
        .set({
          pendingPatch: null,
          pendingDeleteRequested: false,
          metadataChangeStage: null,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id))
        .returning();
      return NextResponse.json({ project: updated });
    }

    return jsonError(400, "Unknown action");
  } catch (err) {
    return handleError(err);
  }
}
