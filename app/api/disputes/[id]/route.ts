import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "@/db";
import {
  disputeEvents,
  disputeMessages,
  disputes,
  orders,
  projects,
  users,
} from "@/db/schema";
import type { DisputeStatus } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";
import {
  disputeOrderScopeProject,
  disputesVisibleWhere,
} from "@/lib/dispute-access";
import { recordDisputeEvent } from "@/lib/dispute-events";
import {
  canApplyTransition,
  canManageDisputes,
  isDisputeMessagingOpen,
  targetStatusForTransition,
  type DisputeTransition,
} from "@/lib/dispute-resolution";

const assigneeUser = alias(users, "dispute_assignee");
const resolverUser = alias(users, "dispute_resolver");

const patchSchema = z.object({
  transition: z
    .enum([
      "start_review",
      "request_response",
      "resolve",
      "close",
      "reopen",
    ])
    .optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  category: z
    .enum([
      "delivery_shortage",
      "wrong_item",
      "damaged_goods",
      "scan_verification",
      "documentation",
      "other",
    ])
    .nullable()
    .optional(),
  resolutionSummary: z.string().trim().min(1).max(8000).optional(),
});

async function loadDisputeForViewer(
  id: string,
  viewerRole: Parameters<typeof disputesVisibleWhere>[0],
  viewerId: string,
) {
  const vis = disputesVisibleWhere(viewerRole, viewerId);
  const whereClause = vis ? and(eq(disputes.id, id), vis) : eq(disputes.id, id);

  const rows = await db
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
      resolutionSummary: disputes.resolutionSummary,
      resolvedAt: disputes.resolvedAt,
      closedAt: disputes.closedAt,
      createdAt: disputes.createdAt,
      updatedAt: disputes.updatedAt,
      createdById: disputes.createdById,
      creatorName: users.name,
      assigneeName: assigneeUser.name,
      resolverName: resolverUser.name,
    })
    .from(disputes)
    .leftJoin(users, eq(disputes.createdById, users.id))
    .leftJoin(projects, eq(disputes.projectId, projects.id))
    .leftJoin(orders, eq(disputes.orderId, orders.id))
    .leftJoin(
      disputeOrderScopeProject,
      eq(orders.projectId, disputeOrderScopeProject.id),
    )
    .leftJoin(assigneeUser, eq(disputes.assignedToId, assigneeUser.id))
    .leftJoin(resolverUser, eq(disputes.resolvedById, resolverUser.id))
    .where(whereClause)
    .limit(1);

  return rows[0] ?? null;
}

/**
 * GET /api/disputes/[id] — thread, messages, and audit events.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  try {
    const { id } = await params;
    const dispute = await loadDisputeForViewer(
      id,
      auth.actor.role,
      auth.actor.userId,
    );
    if (!dispute) return jsonError(404, "Dispute not found");

    const [messages, events] = await Promise.all([
      db
        .select({
          id: disputeMessages.id,
          body: disputeMessages.body,
          createdAt: disputeMessages.createdAt,
          authorId: disputeMessages.userId,
          authorName: users.name,
        })
        .from(disputeMessages)
        .leftJoin(users, eq(disputeMessages.userId, users.id))
        .where(eq(disputeMessages.disputeId, id))
        .orderBy(asc(disputeMessages.createdAt)),
      db
        .select({
          id: disputeEvents.id,
          eventType: disputeEvents.eventType,
          detail: disputeEvents.detail,
          createdAt: disputeEvents.createdAt,
          actorName: users.name,
        })
        .from(disputeEvents)
        .leftJoin(users, eq(disputeEvents.userId, users.id))
        .where(eq(disputeEvents.disputeId, id))
        .orderBy(asc(disputeEvents.createdAt)),
    ]);

    return NextResponse.json({ dispute, messages, events });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * PATCH /api/disputes/[id] — status transitions and triage (coordinators).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  if (!canManageDisputes(auth.actor.role)) {
    return jsonError(
      403,
      "Only logistics or super-admin can update dispute status and assignment.",
    );
  }
  try {
    const { id } = await params;
    const body = patchSchema.parse(await req.json());
    const existing = await db.query.disputes.findFirst({
      where: eq(disputes.id, id),
    });
    if (!existing) return jsonError(404, "Dispute not found");

    const patch: Partial<typeof disputes.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (body.assignedToId !== undefined) {
      patch.assignedToId = body.assignedToId;
      await recordDisputeEvent({
        disputeId: id,
        userId: auth.actor.userId,
        eventType: "assigned",
        detail: { assignedToId: body.assignedToId },
      });
    }

    if (body.priority !== undefined && body.priority !== existing.priority) {
      patch.priority = body.priority;
      await recordDisputeEvent({
        disputeId: id,
        userId: auth.actor.userId,
        eventType: "priority_changed",
        detail: { from: existing.priority, to: body.priority },
      });
    }

    if (body.category !== undefined && body.category !== existing.category) {
      patch.category = body.category;
      await recordDisputeEvent({
        disputeId: id,
        userId: auth.actor.userId,
        eventType: "category_set",
        detail: { category: body.category },
      });
    }

    if (body.transition) {
      const t = body.transition as DisputeTransition;
      if (!canApplyTransition(existing.status, t)) {
        return jsonError(
          400,
          `Cannot apply "${t}" while status is ${existing.status}.`,
        );
      }
      const next = targetStatusForTransition(t);
      patch.status = next;

      if (t === "resolve") {
        if (!body.resolutionSummary?.trim()) {
          return jsonError(
            400,
            "Resolution summary is required when marking a dispute resolved.",
          );
        }
        patch.resolutionSummary = body.resolutionSummary.trim();
        patch.resolvedById = auth.actor.userId;
        patch.resolvedAt = new Date();
        await recordDisputeEvent({
          disputeId: id,
          userId: auth.actor.userId,
          eventType: "resolution_recorded",
          detail: { summary: patch.resolutionSummary },
        });
      }

      if (t === "close") {
        patch.closedAt = new Date();
        if (!existing.resolvedAt && body.resolutionSummary?.trim()) {
          patch.resolutionSummary = body.resolutionSummary.trim();
          patch.resolvedById = auth.actor.userId;
          patch.resolvedAt = new Date();
        }
      }

      if (t === "reopen") {
        patch.resolvedAt = null;
        patch.resolvedById = null;
        patch.closedAt = null;
        patch.resolutionSummary = null;
        await recordDisputeEvent({
          disputeId: id,
          userId: auth.actor.userId,
          eventType: "reopened",
          detail: { from: existing.status },
        });
      }

      if (t !== "reopen") {
        await recordDisputeEvent({
          disputeId: id,
          userId: auth.actor.userId,
          eventType: "status_changed",
          detail: { from: existing.status, to: next, transition: t },
        });
      }
    } else if (body.resolutionSummary?.trim()) {
      patch.resolutionSummary = body.resolutionSummary.trim();
    }

    const [updated] = await db
      .update(disputes)
      .set(patch)
      .where(eq(disputes.id, id))
      .returning();

    return NextResponse.json({ dispute: updated });
  } catch (err) {
    return handleError(err);
  }
}
