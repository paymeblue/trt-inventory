import { NextResponse, type NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  products,
  projectCategories,
  projects,
  stockMovements,
} from "@/db/schema";
import { requireUserAny } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";
import {
  addProjectItemsBodySchema,
  legacyProjectItemInputSchema,
} from "@/lib/project-validation";
import {
  insertPhysicalUnitsForProject,
  loadProjectSkuSet,
  newBatchId,
} from "@/lib/project-items-create";

/**
 * POST /api/projects/[id]/items — add items to a project (PM).
 *
 * - **Legacy**: `{ sku, name, stockQuantity }` without `quantity`/`categoryId` —
 *   one product row (aggregated stock).
 * - **Physical units**: `{ categoryId, quantity }` or `{ name, quantity }` —
 *   `quantity` distinct products (stock 1 each), shared `batchId` for the run.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUserAny(["pm", "super_admin"]);
  if ("error" in auth) return auth.error;
  try {
    const { id: projectId } = await params;
    const raw = await req.json();
    const body = addProjectItemsBodySchema.parse(raw);

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });
    if (!project) return jsonError(404, "Project not found");

    const legacySingle =
      body.stockQuantity !== undefined &&
      body.quantity === undefined &&
      !body.categoryId;

    if (legacySingle) {
      const inner = legacyProjectItemInputSchema.parse({
        sku: body.sku,
        name: body.name,
        stockQuantity: body.stockQuantity,
      });

      const dupe = await db.query.products.findFirst({
        where: and(
          eq(products.projectId, projectId),
          sql`lower(${products.sku}) = lower(${inner.sku})`,
        ),
      });
      if (dupe) {
        return jsonError(
          409,
          `SKU "${inner.sku}" already exists in this project`,
        );
      }

      const [row] = await db
        .insert(products)
        .values({
          projectId,
          sku: inner.sku,
          name: inner.name,
          stockQuantity: inner.stockQuantity,
        })
        .returning();

      if (inner.stockQuantity > 0) {
        await db.insert(stockMovements).values({
          productId: row!.id,
          delta: inner.stockQuantity,
          reason: "initial",
          userId: auth.actor.userId,
        });
      }

      return NextResponse.json({ item: row, kind: "legacy" as const }, { status: 201 });
    }

    const unitCount = body.quantity ?? 1;
    const batchId = newBatchId();

    if (body.categoryId) {
      const cat = await db.query.projectCategories.findFirst({
        where: and(
          eq(projectCategories.id, body.categoryId),
          eq(projectCategories.projectId, projectId),
        ),
      });
      if (!cat) {
        return jsonError(400, "Category not found on this project");
      }

      const created = await db.transaction(async (tx) => {
        const pool = await loadProjectSkuSet(tx, projectId);
        return insertPhysicalUnitsForProject(tx, {
          projectId,
          userId: auth.actor.userId,
          quantity: unitCount,
          categoryId: cat.id,
          batchId,
          skuLabelSource: cat.name,
          displayNameForUnit: () => cat.name,
          existingSkusLower: pool,
        });
      });

      return NextResponse.json(
        {
          items: created,
          batchId,
          kind: "units" as const,
        },
        { status: 201 },
      );
    }

    const name = body.name!.trim();
    const created = await db.transaction(async (tx) => {
      const pool = await loadProjectSkuSet(tx, projectId);
      return insertPhysicalUnitsForProject(tx, {
        projectId,
        userId: auth.actor.userId,
        quantity: unitCount,
        categoryId: null,
        batchId,
        skuLabelSource: name,
        displayNameForUnit: (i, t) =>
          t > 1 ? `${name} · ${i} of ${t}` : name,
        existingSkusLower: pool,
      });
    });

    return NextResponse.json(
      { items: created, batchId, kind: "units" as const },
      { status: 201 },
    );
  } catch (err) {
    return handleError(err);
  }
}
