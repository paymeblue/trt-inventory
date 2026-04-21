import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { orders, products, projects } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
});

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

    return NextResponse.json({ project, items, orders: projectOrders });
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
  const auth = await requireUser("pm");
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

    const [updated] = await db
      .update(projects)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined
          ? { description: body.description ?? null }
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
  const auth = await requireUser("pm");
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
