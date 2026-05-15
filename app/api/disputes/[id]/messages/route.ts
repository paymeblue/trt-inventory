import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { disputeMessages, disputes, orders, projects } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";
import {
  disputeOrderScopeProject,
  disputesVisibleWhere,
} from "@/lib/dispute-access";

const schema = z.object({
  body: z.string().trim().min(1).max(8000),
});

async function disputeVisibleToViewer(
  disputeId: string,
  viewerRole: Parameters<typeof disputesVisibleWhere>[0],
  viewerId: string,
): Promise<boolean> {
  const vis = disputesVisibleWhere(viewerRole, viewerId);
  const whereClause = vis
    ? and(eq(disputes.id, disputeId), vis)
    : eq(disputes.id, disputeId);

  const row = await db
    .select({ one: disputes.id })
    .from(disputes)
    .leftJoin(projects, eq(disputes.projectId, projects.id))
    .leftJoin(orders, eq(disputes.orderId, orders.id))
    .leftJoin(
      disputeOrderScopeProject,
      eq(orders.projectId, disputeOrderScopeProject.id),
    )
    .where(whereClause)
    .limit(1);
  return row.length > 0;
}

/**
 * POST /api/disputes/[id]/messages — append to an existing dispute thread.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  try {
    const { id: disputeId } = await params;
    const ok = await disputeVisibleToViewer(
      disputeId,
      auth.actor.role,
      auth.actor.userId,
    );
    if (!ok) return jsonError(404, "Dispute not found");

    const parsed = schema.parse(await req.json());
    const [row] = await db
      .insert(disputeMessages)
      .values({
        disputeId,
        userId: auth.actor.userId,
        body: parsed.body,
      })
      .returning();

    await db
      .update(disputes)
      .set({ updatedAt: new Date() })
      .where(eq(disputes.id, disputeId));

    return NextResponse.json({ message: row }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
