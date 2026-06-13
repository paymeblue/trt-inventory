'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import useSWR from '@/lib/swr';
import { onWorkspaceOrdersChanged } from '@/lib/workspace-refresh';
import { StatusPill } from '@/components/status-pill';
import { useAuthedUser } from '@/components/session-context';
import { InstallerFlow } from '@/components/installer-flow';
import type { OrderStatus, Role } from '@/db/schema';

interface StatsResponse {
  orders: {
    total: number;
    active: number;
    fulfilled: number;
    anomaly: number;
  };
  items: { totalItems: number; scannedItems: number };
  inventory: { skus: number; totalStock: number; negative: number };
  projects: { total: number; active: number };
  activeOrder: { projectName: string; total: number; scanned: number } | null;
  logisticsProjects?: { awaitingReview: number; approvedLive: number };
  recent: {
    id: string;
    projectId: string;
    projectName: string;
    status: OrderStatus;
    createdBy: string;
    createdAt: string;
    total: number;
    scanned: number;
  }[];
}

function dashboardBlurb(role: Role): string {
  switch (role) {
    case 'installer':
      return 'Open an active order and verify deliveries as they arrive on site.';
    case 'logistics':
      return 'Confirm stock for approved projects and track deliveries across projects.';
    case 'super_admin':
      return 'Approve new projects before they go to logistics, and manage inventory like a PM.';
    default:
      return 'Create projects, manage their items, and onboard installers.';
  }
}

export default function DashboardPage() {
  const user = useAuthedUser();
  const { data, error, isLoading, mutate } =
    useSWR<StatsResponse>('/api/stats');

  useEffect(() => onWorkspaceOrdersChanged(() => void mutate()), [mutate]);

  if (!user) return null;

  const tiles =
    user.role === 'logistics'
      ? [
          {
            label: 'Awaiting review',
            value: data?.logisticsProjects?.awaitingReview ?? 0,
            tone: 'text-[color:var(--info)]',
          },
          {
            label: 'Approved (live)',
            value: data?.logisticsProjects?.approvedLive ?? 0,
            tone: 'text-[color:var(--success)]',
          },
        ]
      : [
          {
            label: 'Projects',
            value: data?.projects.total ?? 0,
            tone: 'text-[color:var(--text)]',
          },
          {
            label: 'Active orders',
            value: data?.orders.active ?? 0,
            tone: 'text-[color:var(--info)]',
          },
          {
            label: 'Fulfilled',
            value: data?.orders.fulfilled ?? 0,
            tone: 'text-[color:var(--success)]',
          },
          {
            label: 'Anomalies',
            value: data?.orders.anomaly ?? 0,
            tone: 'text-[color:var(--danger)]',
          },
        ];

  const activeOrder = data?.activeOrder ?? null;
  const scanRate =
    activeOrder && activeOrder.total > 0
      ? Math.round((activeOrder.scanned / activeOrder.total) * 100)
      : 0;

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">
          Welcome back, {user.name.split(' ')[0]}
        </h1>
        <p className="text-sm text-[color:var(--text-muted)]">
          {dashboardBlurb(user.role)}
        </p>
      </section>

      {error && (
        <div className="card border-[color:var(--danger)] p-4 text-sm text-[color:var(--danger)]">
          Failed to load stats.
        </div>
      )}

      {user.role === 'installer' && (
        <InstallerFlow
          orders={(data?.recent ?? []).map((o) => ({
            id: o.id,
            projectName: o.projectName,
            status: o.status,
            total: o.total,
            scanned: o.scanned,
          }))}
          loading={isLoading}
        />
      )}

      <section
        className={`grid grid-cols-2 gap-4 ${user.role === 'logistics' ? 'md:max-w-xl' : 'md:grid-cols-5'}`}
      >
        {tiles.map((t) => (
          <div key={t.label} className="card p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-[color:var(--text-muted)]">
              {t.label}
            </div>
            <div className={`mt-2 text-3xl font-bold ${t.tone}`}>
              {isLoading ? '—' : t.value}
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {user.role !== 'logistics' ? (
          <div className="card col-span-2 p-6">
            {activeOrder ? (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold">
                      Verification progress
                    </h2>
                    <p className="text-xs font-medium text-[color:var(--primary)] mt-0.5">
                      {activeOrder.projectName}
                    </p>
                    <p className="text-xs text-[color:var(--text-muted)]">
                      Share of order items scanned on-site.
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">{scanRate}%</div>
                    <div className="text-xs text-[color:var(--text-muted)]">
                      {activeOrder.scanned} / {activeOrder.total} items verified
                    </div>
                  </div>
                </div>
                <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-[color:var(--surface-muted)]">
                  <div
                    className="h-full rounded-full bg-[color:var(--primary)] transition-all"
                    style={{ width: `${scanRate}%` }}
                  />
                </div>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center py-4 text-center">
                <div className="text-3xl font-bold text-[color:var(--success)]">✓</div>
                <h2 className="mt-2 text-base font-semibold">All caught up</h2>
                <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                  No active orders in progress.
                </p>
              </div>
            )}
          </div>
        ) : null}

        <div
          className={`card p-6 ${user.role === 'logistics' ? 'md:col-span-3 md:max-w-md' : ''}`}
        >
          <h2 className="text-base font-semibold">Quick actions</h2>
          <p className="text-xs text-[color:var(--text-muted)]">
            Jump into the most common workflow.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {user.role === 'installer' ? (
              <>
                <Link href="/scan" className="btn btn-primary">
                  Verify a delivery
                </Link>
                <Link href="/orders" className="btn btn-ghost">
                  Browse active orders
                </Link>
              </>
            ) : user.role === 'logistics' ? (
              <>
                <Link href="/approvals/logistics" className="btn btn-primary">
                  Awaiting logistics
                </Link>
                <Link href="/projects" className="btn btn-ghost">
                  Projects
                </Link>
                <Link href="/orders" className="btn btn-ghost">
                  Orders
                </Link>
              </>
            ) : (
              <>
                <Link href="/projects" className="btn btn-primary">
                  + Manage projects
                </Link>
                <Link href="/orders/new" className="btn btn-ghost">
                  New order
                </Link>
                <Link href="/team" className="btn btn-ghost">
                  Onboard an installer
                </Link>
                {user.role === 'super_admin' ? (
                  <Link href="/approvals/super-admin" className="btn btn-ghost">
                    Pending approval (SA)
                  </Link>
                ) : null}
              </>
            )}
          </div>
        </div>
      </section>

      {data && data.inventory.negative > 0 && user.role !== 'logistics' && (
        <div className="card border-[color:var(--danger)] p-4 text-sm text-[color:var(--danger)]">
          {data.inventory.negative} item(s) have negative stock. You may have
          verified deliveries that weren&apos;t recorded against the project.
        </div>
      )}

      {user.role !== 'logistics' && (
        <section className="card overflow-hidden">
          <header className="flex items-center justify-between border-b border-[color:var(--border)] px-6 py-4">
            <h2 className="text-base font-semibold">Recent orders</h2>
            <Link
              href="/orders"
              className="text-xs font-semibold text-[color:var(--primary)] hover:underline"
            >
              View all →
            </Link>
          </header>
          <div className="divide-y divide-[color:var(--border)]">
            {(data?.recent ?? []).length === 0 && !isLoading && (
              <div className="px-6 py-10 text-center text-sm text-[color:var(--text-muted)]">
                No orders yet.{' '}
                {(user.role === 'pm' || user.role === 'super_admin') && (
                  <Link
                    href="/orders/new"
                    className="font-semibold text-[color:var(--primary)]"
                  >
                    Create your first one →
                  </Link>
                )}
              </div>
            )}
            {(data?.recent ?? []).map((o) => {
              const pct =
                o.total === 0 ? 0 : Math.round((o.scanned / o.total) * 100);
              return (
                <Link
                  key={o.id}
                  href={`/orders/${o.id}`}
                  className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-[color:var(--surface-muted)]"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{o.projectName}</span>
                      <StatusPill status={o.status} />
                    </div>
                    <div className="text-xs text-[color:var(--text-muted)]">
                      Created by {o.createdBy} ·{' '}
                      {new Date(o.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="w-48">
                    <div className="flex items-center justify-between text-xs text-[color:var(--text-muted)]">
                      <span>
                        {o.scanned}/{o.total} items
                      </span>
                      <span>{pct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--surface-muted)]">
                      <div
                        className="h-full bg-[color:var(--primary)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
