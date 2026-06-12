import { NextResponse } from 'next/server';
import { and, eq, gt, inArray, isNotNull } from 'drizzle-orm';
import { db } from '@/db';
import { orders, projects, users } from '@/db/schema';
import { requireUser } from '@/lib/auth-guard';
import { handleError } from '@/lib/api';

const THRESHOLD_MS = 10 * 60 * 1000;

export type NotificationType =
  | 'project_activated'
  | 'order_created'
  | 'order_fulfilled'
  | 'project_pending_sa'
  | 'project_pending_logistics';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  createdAt: string;
}

export async function GET() {
  const auth = await requireUser();
  if ('error' in auth) return auth.error;

  const { actor } = auth;
  const threshold = new Date(Date.now() - THRESHOLD_MS);
  const result: AppNotification[] = [];

  try {
    // ── PM ──────────────────────────────────────────────────────────────────
    if (actor.role === 'pm') {
      // Projects just activated by logistics that the PM owns and has no order yet
      const activatedProjects = await db.query.projects.findMany({
        where: and(
          eq(projects.approvalStatus, 'active'),
          gt(projects.updatedAt, threshold),
          eq(projects.createdById, actor.userId),
        ),
      });
      for (const p of activatedProjects) {
        const existingOrder = await db.query.orders.findFirst({
          where: and(eq(orders.projectId, p.id), eq(orders.isLogisticsGate, false)),
        });
        if (!existingOrder) {
          result.push({
            id: `${p.id}_activated`,
            type: 'project_activated',
            title: 'Project approved — create an order',
            body: `"${p.name}" was approved by logistics. Create an order to dispatch items to your installer.`,
            href: `/orders/new?projectId=${p.id}`,
            createdAt: p.updatedAt.toISOString(),
          });
        }
      }

      // Recently fulfilled orders for PM's projects
      const pmProjects = await db.query.projects.findMany({
        where: eq(projects.createdById, actor.userId),
        columns: { id: true, name: true, installerUserId: true },
      });
      if (pmProjects.length > 0) {
        const projectIds = pmProjects.map((p) => p.id);
        const fulfilledOrders = await db.query.orders.findMany({
          where: and(
            isNotNull(orders.fulfilledAt),
            gt(orders.fulfilledAt, threshold),
            eq(orders.isLogisticsGate, false),
            inArray(orders.projectId, projectIds),
          ),
          with: { items: true },
        });
        for (const o of fulfilledOrders) {
          const proj = pmProjects.find((p) => p.id === o.projectId);
          let receiverName: string | undefined;
          if (proj?.installerUserId) {
            const installer = await db.query.users.findFirst({
              where: eq(users.id, proj.installerUserId),
              columns: { name: true },
            });
            receiverName = installer?.name;
          }
          result.push({
            id: `${o.id}_fulfilled`,
            type: 'order_fulfilled',
            title: 'Order fulfilled',
            body: `Order for "${proj?.name ?? 'project'}" — ${o.items.length} item(s)${receiverName ? ` verified by ${receiverName}` : ''}.`,
            href: `/orders/${o.id}`,
            createdAt: o.fulfilledAt!.toISOString(),
          });
        }
      }
    }

    // ── SUPER ADMIN ─────────────────────────────────────────────────────────
    if (actor.role === 'super_admin') {
      // New projects awaiting super-admin review
      const pendingSa = await db.query.projects.findMany({
        where: and(
          eq(projects.approvalStatus, 'pending_super_admin'),
          gt(projects.updatedAt, threshold),
        ),
        columns: { id: true, name: true, updatedAt: true },
      });
      for (const p of pendingSa) {
        result.push({
          id: `${p.id}_pending_sa`,
          type: 'project_pending_sa',
          title: 'New project awaiting approval',
          body: `"${p.name}" needs your review before it reaches logistics.`,
          href: `/approvals/super-admin`,
          createdAt: p.updatedAt.toISOString(),
        });
      }

      // Recently fulfilled orders (any project, all PMs)
      const recentlyFulfilled = await db.query.orders.findMany({
        where: and(
          isNotNull(orders.fulfilledAt),
          gt(orders.fulfilledAt, threshold),
          eq(orders.isLogisticsGate, false),
        ),
        with: { project: true, items: true },
      });
      for (const o of recentlyFulfilled) {
        result.push({
          id: `${o.id}_fulfilled`,
          type: 'order_fulfilled',
          title: 'Order fulfilled',
          body: `Order for "${o.project?.name ?? 'a project'}" — ${o.items.length} item(s) verified.`,
          href: `/orders/${o.id}`,
          createdAt: o.fulfilledAt!.toISOString(),
        });
      }
    }

    // ── LOGISTICS ───────────────────────────────────────────────────────────
    if (actor.role === 'logistics') {
      // Projects that just entered the logistics queue
      const pendingLogistics = await db.query.projects.findMany({
        where: and(
          eq(projects.approvalStatus, 'pending_logistics'),
          gt(projects.updatedAt, threshold),
        ),
        columns: { id: true, name: true, updatedAt: true },
      });
      for (const p of pendingLogistics) {
        result.push({
          id: `${p.id}_pending_logistics`,
          type: 'project_pending_logistics',
          title: 'Project ready for warehouse scan',
          body: `"${p.name}" has been approved by super-admin and is waiting for your warehouse verification.`,
          href: `/approvals/logistics`,
          createdAt: p.updatedAt.toISOString(),
        });
      }
    }

    // ── INSTALLER ────────────────────────────────────────────────────────────
    if (actor.role === 'installer') {
      const installerProjects = await db.query.projects.findMany({
        where: and(
          eq(projects.installerUserId, actor.userId),
          eq(projects.approvalStatus, 'active'),
        ),
        columns: { id: true, name: true },
      });
      if (installerProjects.length > 0) {
        const projectIds = installerProjects.map((p) => p.id);
        const newOrders = await db.query.orders.findMany({
          where: and(
            gt(orders.createdAt, threshold),
            eq(orders.isLogisticsGate, false),
            inArray(orders.projectId, projectIds),
          ),
          with: { items: true },
        });
        for (const o of newOrders) {
          const proj = installerProjects.find((p) => p.id === o.projectId);
          result.push({
            id: `${o.id}_created`,
            type: 'order_created',
            title: 'New delivery assigned',
            body: `A delivery for "${proj?.name ?? 'your project'}" is ready — ${o.items.length} item(s) to verify on-site.`,
            href: `/orders/${o.id}`,
            createdAt: o.createdAt.toISOString(),
          });
        }
      }
    }

    result.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return NextResponse.json({ notifications: result });
  } catch (err) {
    return handleError(err);
  }
}
