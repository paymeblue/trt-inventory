import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, products, projects } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";

const createSchema = z.object({
  name: z.string().trim().min(1, "Project name is required").max(120),
  description: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        sku: z.string().trim().min(1).max(80),
        name: z.string().trim().min(1).max(160),
        stockQuantity: z.number().int().min(0).default(0),
      }),
    )
    .optional()
    .default([]),
});

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
    const rows = await db
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        archivedAt: projects.archivedAt,
        createdAt: projects.createdAt,
        itemCount: sql<number>`(
          SELECT count(*)::int FROM ${products}
          WHERE ${products.projectId} = ${projects.id}
        )`,
        totalStock: sql<number>`(
          SELECT coalesce(sum(${products.stockQuantity}), 0)::int FROM ${products}
          WHERE ${products.projectId} = ${projects.id}
        )`,
        activeOrderCount: sql<number>`(
          SELECT count(*)::int FROM ${orders}
          WHERE ${orders.projectId} = ${projects.id} AND ${orders.status} = 'active'
        )`,
        fulfilledOrderCount: sql<number>`(
          SELECT count(*)::int FROM ${orders}
          WHERE ${orders.projectId} = ${projects.id} AND ${orders.status} = 'fulfilled'
        )`,
      })
      .from(projects)
      .orderBy(asc(projects.name));

    return NextResponse.json({ projects: rows });
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
    const body = createSchema.parse(await req.json());

    const dupe = findDuplicateSku(body.items);
    if (dupe) {
      return jsonError(400, `Duplicate SKU "${dupe}" in items list`);
    }

    const nameClash = await db.query.projects.findFirst({
      where: eq(projects.name, body.name),
    });
    if (nameClash) {
      return jsonError(409, `Project "${body.name}" already exists`);
    }

    const result = await db.transaction(async (tx) => {
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

      return { project, items: insertedItems };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

function findDuplicateSku(items: { sku: string }[]): string | null {
  const seen = new Set<string>();
  for (const i of items) {
    const k = i.sku.trim().toLowerCase();
    if (seen.has(k)) return i.sku;
    seen.add(k);
  }
  return null;
}
