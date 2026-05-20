import { and, asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  disputeEvents,
  disputeMessages,
  disputes,
  orders,
  projects,
  users,
} from "@/db/schema";
import type { Role } from "@/db/schema";
import {
  disputeOrderScopeProject,
  disputesVisibleWhere,
} from "@/lib/dispute-access";

export interface DisputeExportBundle {
  dispute: {
    id: string;
    title: string;
    description: string;
    status: string;
    category: string | null;
    priority: string;
    photoPath: string | null;
    projectId: string | null;
    orderId: string | null;
    projectName: string | null;
    orderLabel: string | null;
    createdAt: Date;
    updatedAt: Date;
    resolvedAt: Date | null;
    closedAt: Date | null;
    resolutionSummary: string | null;
    creatorName: string | null;
    assigneeName: string | null;
    resolverName: string | null;
  };
  messages: Array<{
    id: string;
    body: string;
    createdAt: Date;
    authorName: string | null;
  }>;
  events: Array<{
    id: string;
    eventType: string;
    detail: unknown;
    createdAt: Date;
    actorName: string | null;
  }>;
  exportedAt: Date;
  exportedByName: string;
}

export async function loadDisputeBundle(
  disputeId: string,
  viewer: { userId: string; role: Role; name: string },
): Promise<DisputeExportBundle | null> {
  const vis = disputesVisibleWhere(viewer.role, viewer.userId);
  const whereClause = vis
    ? and(eq(disputes.id, disputeId), vis)
    : eq(disputes.id, disputeId);

  const assigneeUser = alias(users, "dispute_assignee");
  const resolverUser = alias(users, "dispute_resolver");

  const rows = await db
    .select({
      id: disputes.id,
      title: disputes.title,
      description: disputes.description,
      status: disputes.status,
      category: disputes.category,
      priority: disputes.priority,
      photoPath: disputes.photoPath,
      projectId: disputes.projectId,
      orderId: disputes.orderId,
      createdAt: disputes.createdAt,
      updatedAt: disputes.updatedAt,
      resolvedAt: disputes.resolvedAt,
      closedAt: disputes.closedAt,
      resolutionSummary: disputes.resolutionSummary,
      creatorName: users.name,
      projectName: projects.name,
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

  const row = rows[0];
  if (!row) return null;

  const [messages, events] = await Promise.all([
    db
      .select({
        id: disputeMessages.id,
        body: disputeMessages.body,
        createdAt: disputeMessages.createdAt,
        authorName: users.name,
      })
      .from(disputeMessages)
      .leftJoin(users, eq(disputeMessages.userId, users.id))
      .where(eq(disputeMessages.disputeId, disputeId))
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
      .where(eq(disputeEvents.disputeId, disputeId))
      .orderBy(asc(disputeEvents.createdAt)),
  ]);

  return {
    dispute: {
      ...row,
      orderLabel: row.orderId ? `Order ${row.orderId}` : null,
    },
    messages,
    events,
    exportedAt: new Date(),
    exportedByName: viewer.name,
  };
}
