import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  disputeMessages,
  disputes,
  orders,
  projects,
  users,
} from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";
import {
  disputeOrderScopeProject,
  disputesVisibleWhere,
} from "@/lib/dispute-access";

/**
 * GET /api/disputes/[id] — one thread + chronological messages when allowed.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  try {
    const { id } = await params;
    const vis = disputesVisibleWhere(auth.actor.role, auth.actor.userId);

    const whereClause = vis
      ? and(eq(disputes.id, id), vis)
      : eq(disputes.id, id);

    const rows = await db
      .select({
        id: disputes.id,
        title: disputes.title,
        description: disputes.description,
        photoPath: disputes.photoPath,
        projectId: disputes.projectId,
        orderId: disputes.orderId,
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
      .where(whereClause)
      .limit(1);

    const dispute = rows[0];
    if (!dispute) return jsonError(404, "Dispute not found");

    const messages = await db
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
      .orderBy(asc(disputeMessages.createdAt));

    return NextResponse.json({ dispute, messages });
  } catch (err) {
    return handleError(err);
  }
}
