import { NextResponse, type NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { products, projects, stockMovements } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";
import { projectItemInputSchema } from "@/lib/project-validation";

/**
 * POST /api/projects/[id]/items → add a new item to a project.
 * SKUs are unique per project. PM-only.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser("pm");
  if ("error" in auth) return auth.error;
  try {
    const { id: projectId } = await params;
    const body = projectItemInputSchema.parse(await req.json());

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });
    if (!project) return jsonError(404, "Project not found");

    const dupe = await db.query.products.findFirst({
      where: and(
        eq(products.projectId, projectId),
        sql`lower(${products.sku}) = lower(${body.sku})`,
      ),
    });
    if (dupe) {
      return jsonError(
        409,
        `SKU "${body.sku}" already exists in this project`,
      );
    }

    const [row] = await db
      .insert(products)
      .values({
        projectId,
        sku: body.sku,
        name: body.name,
        stockQuantity: body.stockQuantity,
      })
      .returning();

    if (body.stockQuantity > 0) {
      await db.insert(stockMovements).values({
        productId: row.id,
        delta: body.stockQuantity,
        reason: "initial",
        userId: auth.actor.userId,
      });
    }

    return NextResponse.json({ item: row }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
