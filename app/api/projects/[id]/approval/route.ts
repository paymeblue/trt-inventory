import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { orders, products, projects } from "@/db/schema";
import { requireUserAny } from "@/lib/auth-guard";
import { generateBarcode } from "@/lib/barcode";
import { handleError, jsonError } from "@/lib/api";
import { ensureLogisticsGateOrder } from "@/lib/logistics-gate-order";

const bodySchema = z.object({
  action: z.enum([
    "super_admin_approve",
    "super_admin_reject",
    "logistics_fulfill",
    "logistics_reject",
    "logistics_apply_patch",
    "discard_pending_patch",
  ]),
});

type PendingPatch = {
  name?: string;
  description?: string | null;
  installerUserId?: string | null;
};

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

    if (body.action === "logistics_fulfill") {
      const auth = await requireUserAny(["logistics"]);
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
      return NextResponse.json({ project: updated });
    }

    if (body.action === "logistics_reject") {
      const auth = await requireUserAny(["logistics"]);
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
      const auth = await requireUserAny(["logistics"]);
      if ("error" in auth) return auth.error;
      const raw = project.pendingPatch as PendingPatch | null | undefined;
      if (!raw || typeof raw !== "object") {
        return jsonError(400, "No pending edits to apply");
      }
      const [updated] = await db
        .update(projects)
        .set({
          ...(raw.name !== undefined ? { name: raw.name } : {}),
          ...(raw.description !== undefined
            ? { description: raw.description }
            : {}),
          ...(raw.installerUserId !== undefined
            ? { installerUserId: raw.installerUserId }
            : {}),
          pendingPatch: null,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id))
        .returning();
      return NextResponse.json({ project: updated });
    }

    const auth = await requireUserAny(["pm", "logistics", "super_admin"]);
    if ("error" in auth) return auth.error;
    const [updated] = await db
      .update(projects)
      .set({ pendingPatch: null, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return NextResponse.json({ project: updated });
  } catch (err) {
    return handleError(err);
  }
}
