import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { orders, products, projects, users } from "@/db/schema";
import { requireUser, requireUserAny } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";
import { isProjectEligibleForNewOrder } from "@/lib/project-new-order-eligibility";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  installerUserId: z.string().uuid().nullable().optional(),
});

type PendingPatch = {
  name?: string;
  description?: string | null;
  installerUserId?: string | null;
};

function mergePending(
  current: unknown,
  incoming: { name?: string; description?: string | null; installerUserId?: string | null },
): PendingPatch {
  const base =
    current && typeof current === "object"
      ? (current as PendingPatch)
      : {};
  return {
    ...base,
    ...(incoming.name !== undefined ? { name: incoming.name } : {}),
    ...(incoming.description !== undefined
      ? { description: incoming.description }
      : {}),
    ...(incoming.installerUserId !== undefined
      ? { installerUserId: incoming.installerUserId }
      : {}),
  };
}

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
    if (
      auth.actor.role === "installer" &&
      project.approvalStatus !== "active"
    ) {
      return jsonError(
        403,
        "This project is not visible until logistics marks it active.",
      );
    }

    const [items, projectOrders] = await Promise.all([
      db
        .select()
        .from(products)
        .where(eq(products.projectId, id))
        .orderBy(asc(products.sku)),
      db
        .select()
        .from(orders)
        .where(eq(orders.projectId, id))
        .orderBy(asc(orders.createdAt)),
    ]);

    const eligibleForNewOrder = await isProjectEligibleForNewOrder(id);

    return NextResponse.json({
      project,
      items,
      orders: projectOrders,
      eligibleForNewOrder,
    });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * PATCH /api/projects/[id] → rename / edit description. PM-only.
 * Name uniqueness is enforced across all non-archived projects.
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

    const hasIncoming =
      body.name !== undefined ||
      body.description !== undefined ||
      body.installerUserId !== undefined;
    if (!hasIncoming) {
      return jsonError(400, "No fields to update");
    }

    if (
      (existing.approvalStatus === "active" ||
        existing.approvalStatus === "pending_logistics") &&
      hasIncoming
    ) {
      const merged = mergePending(existing.pendingPatch, {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined
          ? { description: body.description ?? null }
          : {}),
        ...(body.installerUserId !== undefined
          ? { installerUserId: body.installerUserId }
          : {}),
      });
      const [updated] = await db
        .update(projects)
        .set({
          pendingPatch: merged,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id))
        .returning();
      return NextResponse.json({ project: updated });
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

    await db.delete(projects).where(eq(projects.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
