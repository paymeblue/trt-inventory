import { NextResponse, type NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { disputes, orders, projects, users } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";
import {
  disputeOrderScopeProject,
  disputesVisibleWhere,
} from "@/lib/dispute-access";
import { recordDisputeEvent } from "@/lib/dispute-events";
import { newDisputeId, saveDisputePhoto } from "@/lib/dispute-photo";
import { getPostgresErrorMeta } from "@/lib/postgres-errors";

const createJsonSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(8000),
    projectId: z.string().uuid().nullable().optional(),
    orderId: z.string().uuid().nullable().optional(),
    category: z
      .enum([
        "delivery_shortage",
        "wrong_item",
        "damaged_goods",
        "scan_verification",
        "documentation",
        "other",
      ])
      .optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  })
  .refine((x) => Boolean(x.projectId) || Boolean(x.orderId), {
    message: "Link at least a project or an order",
    path: ["projectId"],
  });

async function resolveProjectAndOrder(
  projectId: string | null,
  orderId: string | null,
): Promise<{ projectId: string | null; orderId: string | null }> {
  if (!orderId) {
    return { projectId, orderId };
  }
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    columns: { projectId: true },
  });
  if (!order) {
    throw new Error("ORDER_NOT_FOUND");
  }
  const resolvedProjectId = projectId ?? order.projectId;
  if (projectId && order.projectId !== projectId) {
    throw new Error("ORDER_PROJECT_MISMATCH");
  }
  return {
    projectId: resolvedProjectId,
    orderId,
  };
}

function disputeApiError(err: unknown) {
  const meta = getPostgresErrorMeta(err);
  if (meta.code === "42703" || meta.code === "42P01") {
    return jsonError(
      503,
      "Dispute tables are out of date. Run npm run db:migrate and try again.",
    );
  }
  if (err instanceof Error) {
    if (err.message === "ORDER_NOT_FOUND") {
      return jsonError(
        400,
        "No order exists with that ID, or your account can't see it. Pick an order from the list.",
      );
    }
    if (err.message === "ORDER_PROJECT_MISMATCH") {
      return jsonError(400, "Order does not belong to the selected project");
    }
    if (
      err.message.includes("image") ||
      err.message.includes("2.5 MB") ||
      err.message.includes("empty")
    ) {
      return jsonError(400, err.message);
    }
    if (err.message.includes("ENOENT") || err.message.includes("EACCES")) {
      return jsonError(
        500,
        "Could not save the photo on the server. Try again without a photo or contact support.",
      );
    }
  }
  return handleError(err);
}

/**
 * GET /api/disputes — threads visible to the signed-in user.
 */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  try {
    const vis = disputesVisibleWhere(auth.actor.role, auth.actor.userId);
    const base = db
      .select({
        id: disputes.id,
        title: disputes.title,
        description: disputes.description,
        photoPath: disputes.photoPath,
        projectId: disputes.projectId,
        orderId: disputes.orderId,
        status: disputes.status,
        category: disputes.category,
        priority: disputes.priority,
        assignedToId: disputes.assignedToId,
        resolvedAt: disputes.resolvedAt,
        closedAt: disputes.closedAt,
        createdAt: disputes.createdAt,
        createdById: disputes.createdById,
        creatorName: users.name,
      })
      .from(disputes)
      .leftJoin(users, eq(disputes.createdById, users.id))
      .leftJoin(projects, eq(disputes.projectId, projects.id))
      .leftJoin(orders, eq(disputes.orderId, orders.id))
      .leftJoin(
        disputeOrderScopeProject,
        eq(orders.projectId, disputeOrderScopeProject.id),
      )
      .orderBy(desc(disputes.createdAt));

    const rows = vis ? await base.where(vis) : await base;
    return NextResponse.json({ disputes: rows });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /api/disputes — JSON or multipart (optional `photo` file field).
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  try {
    const ct = req.headers.get("content-type") ?? "";
    let title: string;
    let description: string;
    let projectId: string | null = null;
    let orderId: string | null = null;
    let photoFile: File | null = null;
    let category:
      | z.infer<typeof createJsonSchema>["category"]
      | undefined;
    let priority: z.infer<typeof createJsonSchema>["priority"] | undefined;

    if (ct.includes("multipart/form-data")) {
      const raw = await req.formData();
      const formData = raw as unknown as {
        get(name: string): unknown;
      };
      title = String(formData.get("title") ?? "").trim();
      description = String(formData.get("description") ?? "").trim();
      const p = formData.get("projectId");
      const o = formData.get("orderId");
      projectId = typeof p === "string" && p.trim() ? p.trim() : null;
      orderId = typeof o === "string" && o.trim() ? o.trim() : null;
      const f = formData.get("photo");
      photoFile =
        typeof File !== "undefined" && f instanceof File && f.size > 0
          ? f
          : null;
      const cat = formData.get("category");
      const pri = formData.get("priority");
      const catParsed = z
        .enum([
          "delivery_shortage",
          "wrong_item",
          "damaged_goods",
          "scan_verification",
          "documentation",
          "other",
        ])
        .safeParse(typeof cat === "string" && cat ? cat : undefined);
      if (catParsed.success) category = catParsed.data;
      const priParsed = z
        .enum(["low", "normal", "high", "urgent"])
        .safeParse(typeof pri === "string" && pri ? pri : "normal");
      priority = priParsed.success ? priParsed.data : "normal";
    } else {
      const body = createJsonSchema.parse(await req.json());
      title = body.title;
      description = body.description;
      projectId = body.projectId ?? null;
      orderId = body.orderId ?? null;
      category = body.category;
      priority = body.priority;
    }

    if (!title || !description) {
      return jsonError(400, "Title and description are required");
    }
    if (!projectId && !orderId) {
      return jsonError(400, "Link at least a project or an order");
    }

    if (orderId && !z.string().uuid().safeParse(orderId).success) {
      return jsonError(
        400,
        "That order identifier is not a valid UUID — pick one from the order picker.",
      );
    }

    const resolved = await resolveProjectAndOrder(projectId, orderId);
    projectId = resolved.projectId;
    orderId = resolved.orderId;

    if (projectId) {
      const p = await db.query.projects.findFirst({
        where: eq(projects.id, projectId),
      });
      if (!p) return jsonError(400, "Project not found");
    }

    const disputeId = newDisputeId();
    let photoPath: string | null = null;

    if (photoFile) {
      try {
        photoPath = await saveDisputePhoto(disputeId, photoFile);
      } catch (e) {
        return jsonError(400, (e as Error).message);
      }
    }

    const [created] = await db
      .insert(disputes)
      .values({
        id: disputeId,
        title,
        description,
        createdById: auth.actor.userId,
        projectId,
        orderId,
        photoPath,
        category: category ?? null,
        priority: priority ?? "normal",
        status: "open",
      })
      .returning();

    if (!created) return jsonError(500, "Failed to create dispute");

    try {
      await recordDisputeEvent({
        disputeId: created.id,
        userId: auth.actor.userId,
        eventType: "created",
        detail: {
          title,
          category: category ?? null,
          priority: priority ?? "normal",
          hasPhoto: Boolean(photoPath),
        },
      });
    } catch (eventErr) {
      await db.delete(disputes).where(eq(disputes.id, created.id));
      return disputeApiError(eventErr);
    }

    return NextResponse.json({ dispute: created }, { status: 201 });
  } catch (err) {
    return disputeApiError(err);
  }
}
