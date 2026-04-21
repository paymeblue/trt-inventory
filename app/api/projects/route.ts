import { NextResponse, type NextRequest } from "next/server";
import { asc, count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, products, projects, stockMovements } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";
import {
  getPostgresErrorMeta,
  isUniqueViolation,
  uniqueViolationUserMessage,
} from "@/lib/postgres-errors";
import { buildInitialStockMovementInserts } from "@/lib/project-create-stock";
import {
  createProjectBodySchema,
  findDuplicateSkuInPayload,
} from "@/lib/project-validation";
import { enrichProjectsWithRollups } from "@/lib/projects-rollup";

/**
 * GET /api/projects → list all projects with rollup counts (items,
 * active orders, fulfilled orders) for the list page. Available to any
 * authenticated user — installers may need to see projects they have
 * deliveries under.
 */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  try {
    const [projectRows, itemRollups, orderRollups] = await Promise.all([
      db
        .select({
          id: projects.id,
          name: projects.name,
          description: projects.description,
          archivedAt: projects.archivedAt,
          createdAt: projects.createdAt,
        })
        .from(projects)
        .orderBy(asc(projects.name)),
      db
        .select({
          projectId: products.projectId,
          itemCount: count(),
          totalStock: sql<number>`coalesce(sum(${products.stockQuantity}), 0)::int`,
        })
        .from(products)
        .groupBy(products.projectId),
      db
        .select({
          projectId: orders.projectId,
          status: orders.status,
          orderCount: count(),
        })
        .from(orders)
        .groupBy(orders.projectId, orders.status),
    ]);

    const enriched = enrichProjectsWithRollups(
      projectRows,
      itemRollups as { projectId: string; itemCount: number; totalStock: number }[],
      orderRollups as {
        projectId: string;
        status: "draft" | "active" | "fulfilled" | "anomaly";
        orderCount: number;
      }[],
    );

    return NextResponse.json({ projects: enriched });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /api/projects → create a project, optionally with its initial
 * items in a single transaction. PM-only.
 *
 * Items are unique by SKU inside the project; the request is rejected
 * outright if the client sends duplicate SKUs in the same payload.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser("pm");
  if ("error" in auth) return auth.error;
  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return jsonError(400, "Invalid JSON body");
    }

    const body = createProjectBodySchema.parse(raw);

    const dupe = findDuplicateSkuInPayload(body.items);
    if (dupe) {
      return jsonError(400, `Duplicate SKU "${dupe}" in items list`);
    }

    const nameClash = await db.query.projects.findFirst({
      where: eq(projects.name, body.name),
    });
    if (nameClash) {
      return jsonError(409, `Project "${body.name}" already exists`);
    }

    let result: {
      project: typeof projects.$inferSelect;
      items: (typeof products.$inferSelect)[];
    };
    try {
      result = await db.transaction(async (tx) => {
        const [project] = await tx
          .insert(projects)
          .values({
            name: body.name,
            description: body.description ?? null,
            createdById: auth.actor.userId,
          })
          .returning();

        const insertedItems = body.items.length
          ? await tx
              .insert(products)
              .values(
                body.items.map((i) => ({
                  projectId: project.id,
                  sku: i.sku,
                  name: i.name,
                  stockQuantity: i.stockQuantity,
                })),
              )
              .returning()
          : [];

        const initialMoves = buildInitialStockMovementInserts(
          insertedItems,
          body.items,
          auth.actor.userId,
        );

        if (initialMoves.length) {
          await tx.insert(stockMovements).values(initialMoves);
        }

        return { project, items: insertedItems };
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const { constraint } = getPostgresErrorMeta(err);
        return jsonError(409, uniqueViolationUserMessage(constraint));
      }
      throw err;
    }

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
