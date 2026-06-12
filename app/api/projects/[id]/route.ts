import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { orders, products, projectCategories, projects, users } from "@/db/schema";
import { requireUser, requireUserAny } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";
import { isProjectEligibleForNewOrder } from "@/lib/project-new-order-eligibility";
import {
  METADATA_PENDING_LOGISTICS,
  METADATA_PENDING_SUPER_ADMIN,
} from "@/lib/metadata-stages";
import { projectLivesOnSite } from "@/lib/project-live";
import {
  mergeProjectPendingPatch,
  type ProjectPendingPatch,
} from "@/lib/project-pending-patch";
import { projectSitePatchSchema } from "@/lib/project-validation";

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    installerUserId: z.string().uuid().nullable().optional(),
  })
  .merge(projectSitePatchSchema);

/**
 * GET /api/projects/[id] → full project detail: the project row, its
 * items (sorted by SKU), and the list of orders under it.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  try {
    const { id } = await params;
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, id),
    });
    if (!project) return jsonError(404, "Project not found");
    if (auth.actor.role === "installer") {
      if (project.approvalStatus !== "active") {
        return jsonError(
          403,
          "This project is not visible until logistics marks it active.",
        );
      }
      const deliveryOrder = await db.query.orders.findFirst({
        where: and(eq(orders.projectId, id), eq(orders.isLogisticsGate, false)),
        columns: { id: true },
      });
      if (!deliveryOrder) {
        return jsonError(
          403,
          "This project is not visible until the PM creates a delivery order.",
        );
      }
    }

    const [itemRows, categoryRows, projectOrders] = await Promise.all([
      db
        .select({
          id: products.id,
          projectId: products.projectId,
          sku: products.sku,
          name: products.name,
          stockQuantity: products.stockQuantity,
          createdAt: products.createdAt,
          categoryId: products.categoryId,
          batchId: products.batchId,
          categoryName: projectCategories.name,
        })
        .from(products)
        .leftJoin(
          projectCategories,
          eq(products.categoryId, projectCategories.id),
        )
        .where(eq(products.projectId, id))
        .orderBy(asc(products.sku)),
      db
        .select({
          id: projectCategories.id,
          name: projectCategories.name,
          createdAt: projectCategories.createdAt,
        })
        .from(projectCategories)
        .where(eq(projectCategories.projectId, id))
        .orderBy(asc(projectCategories.name)),
      db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.projectId, id),
            ...(auth.actor.role === "logistics" || auth.actor.role === "super_admin"
              ? []
              : [eq(orders.isLogisticsGate, false)]),
          ),
        )
        .orderBy(asc(orders.createdAt)),
    ]);

    const eligibleForNewOrder = await isProjectEligibleForNewOrder(id);

    return NextResponse.json({
      project,
      items: itemRows,
      categories: categoryRows,
      orders: projectOrders,
      eligibleForNewOrder,
    });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * PATCH /api/projects/[id] → rename / description / installer.
 * Active and pending-logistics projects queue metadata for SA → logistics.
 * Other statuses apply immediately. Name uniqueness enforced globally.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUserAny(["pm", "super_admin"]);
  if ("error" in auth) return auth.error;
  try {
    const { id } = await params;
    const body = updateSchema.parse(await req.json());

    const existing = await db.query.projects.findFirst({
      where: eq(projects.id, id),
    });
    if (!existing) return jsonError(404, "Project not found");

    if (body.name && body.name !== existing.name) {
      const nameClash = await db.query.projects.findFirst({
        where: and(eq(projects.name, body.name), ne(projects.id, id)),
      });
      if (nameClash) {
        return jsonError(409, `Project "${body.name}" already exists`);
      }
    }

    if (body.installerUserId !== undefined && body.installerUserId !== null) {
      const inst = await db.query.users.findFirst({
        where: eq(users.id, body.installerUserId),
        columns: { id: true, role: true },
      });
      if (!inst) return jsonError(400, "That user does not exist");
      if (inst.role !== "installer") {
        return jsonError(400, "Project installer must be a user with the installer role");
      }
    }

    const hasSitePatch =
      body.siteAddress !== undefined ||
      body.siteLatitude !== undefined ||
      body.siteLongitude !== undefined;
    if (
      hasSitePatch &&
      (body.siteAddress === undefined ||
        body.siteLatitude === undefined ||
        body.siteLongitude === undefined)
    ) {
      return jsonError(
        400,
        "Site updates require address, latitude, and longitude together",
      );
    }

    const hasIncoming =
      body.name !== undefined ||
      body.description !== undefined ||
      body.installerUserId !== undefined ||
      hasSitePatch ||
      body.geofenceRadiusMeters !== undefined;
    if (!hasIncoming) {
      return jsonError(400, "No fields to update");
    }

    const livesOnSite = projectLivesOnSite(existing.approvalStatus);
    const patchIncoming: ProjectPendingPatch = {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined
        ? { description: body.description ?? null }
        : {}),
      ...(body.installerUserId !== undefined
        ? { installerUserId: body.installerUserId }
        : {}),
      ...(body.siteAddress !== undefined ? { siteAddress: body.siteAddress } : {}),
      ...(body.siteLatitude !== undefined
        ? { siteLatitude: body.siteLatitude }
        : {}),
      ...(body.siteLongitude !== undefined
        ? { siteLongitude: body.siteLongitude }
        : {}),
      ...(body.geofenceRadiusMeters !== undefined
        ? { geofenceRadiusMeters: body.geofenceRadiusMeters }
        : {}),
    };

    /** Live projects: metadata changes queue for SA → logistics (every role, incl. super_admin). */
    if (livesOnSite && hasIncoming) {
      const merged = mergeProjectPendingPatch(
        existing.pendingPatch,
        patchIncoming,
      );
      const [updated] = await db
        .update(projects)
        .set({
          pendingPatch: merged,
          metadataChangeStage: METADATA_PENDING_SUPER_ADMIN,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id))
        .returning();
      return NextResponse.json({
        project: updated,
        queuedForApproval: true as const,
      });
    }

    const [updated] = await db
      .update(projects)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined
          ? { description: body.description ?? null }
          : {}),
        ...(body.installerUserId !== undefined
          ? { installerUserId: body.installerUserId }
          : {}),
        ...(body.siteAddress !== undefined
          ? { siteAddress: body.siteAddress }
          : {}),
        ...(body.siteLatitude !== undefined
          ? { siteLatitude: body.siteLatitude }
          : {}),
        ...(body.siteLongitude !== undefined
          ? { siteLongitude: body.siteLongitude }
          : {}),
        ...(body.geofenceRadiusMeters !== undefined
          ? { geofenceRadiusMeters: body.geofenceRadiusMeters }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id))
      .returning();

    return NextResponse.json({ project: updated });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * DELETE /api/projects/[id] → permanently delete a project and its
 * items. Refuses if any order exists under the project (even draft /
 * anomaly), because that would break audit trails. PMs must delete the
 * orders first — an explicit destructive act rather than a surprise
 * cascade.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUserAny(["pm", "super_admin"]);
  if ("error" in auth) return auth.error;
  try {
    const { id } = await params;

    const existing = await db.query.projects.findFirst({
      where: eq(projects.id, id),
    });
    if (!existing) return jsonError(404, "Project not found");

    const orderCount = await db.query.orders.findFirst({
      where: eq(orders.projectId, id),
    });
    if (orderCount) {
      return jsonError(
        409,
        "This project still has orders. Delete or move them first, then delete the project.",
      );
    }

    const isPm = auth.actor.role === "pm";
    const livesOnSite =
      existing.approvalStatus === "active" ||
      existing.approvalStatus === "pending_logistics";

    if (livesOnSite) {
      if (isPm) {
        const [updated] = await db
          .update(projects)
          .set({
            pendingDeleteRequested: true,
            metadataChangeStage: METADATA_PENDING_SUPER_ADMIN,
            updatedAt: new Date(),
          })
          .where(eq(projects.id, id))
          .returning();
        return NextResponse.json({
          ok: true,
          queuedForApproval: true as const,
          project: updated,
        });
      }
      const [updated] = await db
        .update(projects)
        .set({
          pendingDeleteRequested: true,
          metadataChangeStage: METADATA_PENDING_LOGISTICS,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id))
        .returning();
      return NextResponse.json({
        ok: true,
        queuedForApproval: true as const,
        project: updated,
      });
    }

    await db.delete(projects).where(eq(projects.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
