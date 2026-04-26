import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, products, projects } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";
import { insertOrderItemLine } from "@/lib/order-item-line";

const createOrderSchema = z.object({
  projectId: z.string().uuid("projectId must be a UUID"),
});

/**
 * GET /api/orders → list orders joined to their parent project.
 * The UI used to show a free-text `projectName`; we keep that field
 * name in the response so existing components don't have to change,
 * but it's sourced from `projects.name` now.
 */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  try {
    const rows = await db.query.orders.findMany({
      with: { items: true, project: true },
      orderBy: [desc(orders.createdAt)],
    });

    const payload = rows.map((o) => {
      const total = o.items.length;
      const scanned = o.items.filter((i) => i.scannedAt !== null).length;
      return {
        id: o.id,
        projectId: o.projectId,
        projectName: o.project?.name ?? "Unknown project",
        status: o.status,
        createdBy: o.createdBy,
        createdAt: o.createdAt,
        completedAt: o.completedAt,
        fulfilledAt: o.fulfilledAt,
        total,
        scanned,
      };
    });

    return NextResponse.json({ orders: payload });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /api/orders → create an order for a project and **seed every current
 * project SKU** as an order line (unique barcode each). An order is a
 * dispatched snapshot of the project; PMs can still remove lines or add
 * newly-created SKUs until the first scan (same rules as POST …/items).
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser("pm");
  if ("error" in auth) return auth.error;
  try {
    const { projectId } = createOrderSchema.parse(await req.json());

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });
    if (!project) return jsonError(404, "Project not found");

    const row = await db.transaction(async (tx) => {
      const [orderRow] = await tx
        .insert(orders)
        .values({
          projectId,
          createdBy: auth.actor.name,
          createdById: auth.actor.userId,
          status: "active",
        })
        .returning();

      const prods = await tx.query.products.findMany({
        where: eq(products.projectId, projectId),
        orderBy: [asc(products.sku)],
      });

      for (const p of prods) {
        await insertOrderItemLine(tx, orderRow.id, p.sku);
      }

      return orderRow;
    });

    return NextResponse.json({ order: row, project }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
