import { NextResponse, type NextRequest } from "next/server";
import { asc, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, products, projects, stockMovements } from "@/db/schema";
import { DEFAULT_GEOFENCE_RADIUS_M } from "@/lib/geofence";
import { applyCreateProjectInventory } from "@/lib/project-create-inventory";
import { requireUser, requireUserAny } from "@/lib/auth-guard";
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
import { findProjectIdsBlockedForNewOrder } from "@/lib/project-new-order-eligibility";
import { enrichProjectsWithRollups } from "@/lib/projects-rollup";

/**
 * GET /api/projects → list all projects with rollup counts (items,
 * active orders, fulfilled orders) for the list page. Available to any
 * authenticated user — installers may need to see projects they have
 * deliveries under.
 *
 * Query: `?forNewOrder=1` — only projects that may receive a new order
 * (no fulfilled orders and no verified/scanned lines on any order).
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  try {
    const forNewOrder =
      req.nextUrl.searchParams.get("forNewOrder") === "1" ||
      req.nextUrl.searchParams.get("forNewOrder") === "true";
    const { actor } = auth;
    const whereRole =
      actor.role === "installer"
        ? eq(projects.approvalStatus, "active")
        : actor.role === "logistics"
          ? inArray(projects.approvalStatus, [
              "pending_logistics",
              "active",
            ])
          : undefined;

    const baseSelect = {
      id: projects.id,
      name: projects.name,
      description: projects.description,
      archivedAt: projects.archivedAt,
      createdAt: projects.createdAt,
      approvalStatus: projects.approvalStatus,
    };

    const projectRows = whereRole
      ? await db
          .select(baseSelect)
          .from(projects)
          .where(whereRole)
          .orderBy(asc(projects.name))
      : await db
          .select(baseSelect)
          .from(projects)
          .orderBy(asc(projects.name));
    const [itemRollups, orderRollups] = await Promise.all([
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

    let payload = enriched;
    if (forNewOrder) {
      const blocked = await findProjectIdsBlockedForNewOrder();
      payload = enriched.filter(
        (p) =>
          !blocked.has(p.id) && p.approvalStatus === "active",
      );
    }

    return NextResponse.json({ projects: payload });
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
  const auth = await requireUserAny(["pm", "super_admin"]);
  if ("error" in auth) return auth.error;
  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return jsonError(400, "Invalid JSON body");
    }

    const body = createProjectBodySchema.parse(raw);

    const isPm = auth.actor.role === "pm";
    const hasSite =
      body.siteAddress &&
      body.siteLatitude !== undefined &&
      body.siteLongitude !== undefined;
    if (isPm && !hasSite) {
      return jsonError(
        400,
        "Project site address is required. Confirm the location before creating the project.",
      );
    }

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
            approvalStatus: "pending_super_admin",
            ...(hasSite
              ? {
                  siteAddress: body.siteAddress!,
                  siteLatitude: body.siteLatitude!,
                  siteLongitude: body.siteLongitude!,
                  geofenceRadiusMeters:
                    body.geofenceRadiusMeters ?? DEFAULT_GEOFENCE_RADIUS_M,
                }
              : {}),
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

        await applyCreateProjectInventory(tx, {
          projectId: project.id,
          userId: auth.actor.userId,
          body,
        });

        return {
          project,
          items: insertedItems,
        };
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
