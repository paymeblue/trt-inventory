"use client";

import Link from "next/link";
import useSWR from "@/lib/swr";
import { StatusPill } from "@/components/status-pill";
import { useAuthedUser } from "@/components/session-context";
import type { OrderStatus } from "@/db/schema";

interface StatsResponse {
  orders: {
    total: number;
    active: number;
    fulfilled: number;
    anomaly: number;
  };
  items: { totalItems: number; scannedItems: number };
  warehouse: { skus: number; totalStock: number; negative: number };
  recent: {
    id: string;
    projectName: string;
    status: OrderStatus;
    createdBy: string;
    createdAt: string;
    total: number;
    scanned: number;
  }[];
}

export default function DashboardPage() {
  const user = useAuthedUser();
  const { data, error, isLoading } = useSWR<StatsResponse>("/api/stats");

  if (!user) return null;

  const tiles = [
    { label: "Total Orders", value: data?.orders.total ?? 0, tone: "text-[color:var(--text)]" },
    { label: "Active", value: data?.orders.active ?? 0, tone: "text-[color:var(--info)]" },
    { label: "Fulfilled", value: data?.orders.fulfilled ?? 0, tone: "text-[color:var(--success)]" },
    { label: "Anomalies", value: data?.orders.anomaly ?? 0, tone: "text-[color:var(--danger)]" },
    { label: "SKUs in stock", value: data?.warehouse.totalStock ?? 0, tone: "text-[color:var(--text)]" },
  ];

  const scanRate =
    data && data.items.totalItems > 0
      ? Math.round((data.items.scannedItems / data.items.totalItems) * 100)
      : 0;

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">
          Welcome back, {user.name.split(" ")[0]}
        </h1>
        <p className="text-sm text-[color:var(--text-muted)]">
          {user.role === "pm"
            ? "Create orders, manage the warehouse, and onboard installers."
            : "Open an active order and scan deliveries as they arrive on site."}
        </p>
      </section>

      {error && (
        <div className="card border-[color:var(--danger)] p-4 text-sm text-[color:var(--danger)]">
          Failed to load stats.
        </div>
      )}

      <section className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.label} className="card p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-[color:var(--text-muted)]">
              {t.label}
            </div>
            <div className={`mt-2 text-3xl font-bold ${t.tone}`}>
              {isLoading ? "—" : t.value}
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="card col-span-2 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Verification progress</h2>
              <p className="text-xs text-[color:var(--text-muted)]">
                Share of order items that have been scanned on-site.
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{scanRate}%</div>
              <div className="text-xs text-[color:var(--text-muted)]">
                {data?.items.scannedItems ?? 0} / {data?.items.totalItems ?? 0}{" "}
                items verified
              </div>
            </div>
          </div>
          <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-[color:var(--surface-muted)]">
            <div
              className="h-full rounded-full bg-[color:var(--primary)] transition-all"
              style={{ width: `${scanRate}%` }}
            />
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-base font-semibold">Quick actions</h2>
          <p className="text-xs text-[color:var(--text-muted)]">
            Jump into the most common workflow.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {user.role === "pm" ? (
              <>
                <Link href="/orders/new" className="btn btn-primary">
                  + Create new order
                </Link>
                <Link href="/warehouse" className="btn btn-ghost">
                  Manage warehouse
                </Link>
                <Link href="/team" className="btn btn-ghost">
                  Onboard an installer
                </Link>
              </>
            ) : (
              <>
                <Link href="/scan" className="btn btn-primary">
                  Start scanning
                </Link>
                <Link href="/orders" className="btn btn-ghost">
                  Browse active orders
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {data && data.warehouse.negative > 0 && (
        <div className="card border-[color:var(--danger)] p-4 text-sm text-[color:var(--danger)]">
          {data.warehouse.negative} SKU(s) have negative stock. You may have
          delivered items that weren&apos;t recorded in the warehouse.
        </div>
      )}

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
              No orders yet.{" "}
              {user.role === "pm" && (
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
                    Created by {o.createdBy} ·{" "}
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
    </div>
  );
}
