"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "@/lib/swr";
import { StatusPill } from "@/components/status-pill";
import { useAuthedUser } from "@/components/session-context";
import type { OrderStatus } from "@/db/schema";

interface OrderRow {
  id: string;
  projectName: string;
  status: OrderStatus;
  createdBy: string;
  createdAt: string;
  total: number;
  scanned: number;
}

interface OrdersResponse {
  orders: OrderRow[];
}

type FilterValue = OrderStatus | "all";
type ViewMode = "table" | "cards";

const FILTERS: { label: string; value: FilterValue }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Anomaly", value: "anomaly" },
  { label: "Fulfilled", value: "fulfilled" },
];

/**
 * Orders listing with two presentation modes:
 *   - Table: dense, best for PMs reviewing many orders and the "Fulfilled
 *     orders" ledger the product requirement calls for.
 *   - Cards: visual, best for installers who need to pick a delivery to
 *     verify on a phone / tablet.
 *
 * Both modes share the same filter + search state so the user's intent
 * (e.g. "just fulfilled ones") travels with them across views. Default
 * view is role-aware: installers get Cards, PMs get Table.
 */
export default function OrdersPage() {
  const user = useAuthedUser();
  const { data, isLoading, error } = useSWR<OrdersResponse>("/api/orders");
  const [filter, setFilter] = useState<FilterValue>("all");
  const [query, setQuery] = useState("");
  // Default mode depends on role. Rendered on client so no SSR/DOM issue.
  const defaultView: ViewMode = user?.role === "installer" ? "cards" : "table";
  const [view, setView] = useState<ViewMode>(defaultView);
  useEffect(() => {
    // If the user's role is resolved after the initial render, snap to
    // that role's default view exactly once.
    setView(defaultView);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  const orders = data?.orders ?? [];

  const counts = useMemo(() => {
    const total = orders.length;
    const active = orders.filter((o) => o.status === "active").length;
    const anomaly = orders.filter((o) => o.status === "anomaly").length;
    const fulfilled = orders.filter((o) => o.status === "fulfilled").length;
    return { total, active, anomaly, fulfilled };
  }, [orders]);

  const rows = useMemo(
    () =>
      orders
        .filter((o) => (filter === "all" ? true : o.status === filter))
        .filter((o) =>
          query.trim()
            ? o.projectName.toLowerCase().includes(query.trim().toLowerCase())
            : true,
        ),
    [orders, filter, query],
  );

  if (!user) return null;
  const { role } = user;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Orders</h1>
          <p className="text-sm text-[color:var(--text-muted)]">
            {role === "pm"
              ? "Manage orders across projects. Fulfilled orders live here as a searchable ledger."
              : "Deliveries assigned to this workspace. Open one to verify its items."}
          </p>
        </div>
        {role === "pm" && (
          <Link href="/orders/new" className="btn btn-primary self-start">
            + New Order
          </Link>
        )}
      </div>

      <SummaryRow counts={counts} onPick={setFilter} active={filter} />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === f.value
                  ? "border-[color:var(--primary)] bg-[color:var(--primary)] text-[color:var(--primary-foreground)]"
                  : "border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text-muted)] hover:bg-[color:var(--surface-muted)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            className="input md:max-w-xs"
            placeholder="Search project name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ViewSwitch value={view} onChange={setView} />
        </div>
      </div>

      {error && (
        <div className="card border-[color:var(--danger)] p-4 text-sm text-[color:var(--danger)]">
          Failed to load orders.
        </div>
      )}

      {rows.length === 0 && !isLoading ? (
        <EmptyState filter={filter} role={role} />
      ) : view === "table" ? (
        <OrdersTable rows={rows} />
      ) : (
        <OrdersCards rows={rows} />
      )}
    </div>
  );
}

function SummaryRow({
  counts,
  active,
  onPick,
}: {
  counts: { total: number; active: number; anomaly: number; fulfilled: number };
  active: FilterValue;
  onPick: (f: FilterValue) => void;
}) {
  const tiles: { label: string; value: number; filter: FilterValue; tone: string }[] = [
    { label: "All orders", value: counts.total, filter: "all", tone: "" },
    { label: "Active", value: counts.active, filter: "active", tone: "text-[color:var(--info)]" },
    { label: "Anomaly", value: counts.anomaly, filter: "anomaly", tone: "text-[color:var(--danger)]" },
    { label: "Fulfilled", value: counts.fulfilled, filter: "fulfilled", tone: "text-[color:var(--success)]" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((t) => (
        <button
          key={t.label}
          onClick={() => onPick(t.filter)}
          className={`card p-4 text-left transition-colors ${
            active === t.filter
              ? "border-[color:var(--primary)]"
              : "hover:bg-[color:var(--surface-muted)]"
          }`}
          aria-pressed={active === t.filter}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            {t.label}
          </div>
          <div className={`mt-1 text-2xl font-bold ${t.tone}`}>{t.value}</div>
        </button>
      ))}
    </div>
  );
}

function ViewSwitch({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div
      className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-1 text-xs font-semibold"
      role="tablist"
      aria-label="View mode"
    >
      {(
        [
          { k: "table" as const, label: "Table" },
          { k: "cards" as const, label: "Cards" },
        ]
      ).map(({ k, label }) => (
        <button
          key={k}
          role="tab"
          aria-selected={value === k}
          onClick={() => onChange(k)}
          className={`rounded-full px-3 py-1 transition-colors ${
            value === k
              ? "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]"
              : "text-[color:var(--text-muted)]"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function OrdersTable({ rows }: { rows: OrderRow[] }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--surface-muted)] text-xs uppercase tracking-wide text-[color:var(--text-muted)]">
            <tr>
              <th className="px-6 py-3 text-left">Project</th>
              <th className="px-6 py-3 text-left">Status</th>
              <th className="px-6 py-3 text-left">Created by</th>
              <th className="px-6 py-3 text-left">Created</th>
              <th className="px-6 py-3 text-left">Progress</th>
              <th className="px-6 py-3 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--border)]">
            {rows.map((o) => {
              const pct =
                o.total === 0 ? 0 : Math.round((o.scanned / o.total) * 100);
              return (
                <tr
                  key={o.id}
                  className="hover:bg-[color:var(--surface-muted)]"
                >
                  <td className="px-6 py-3 font-medium">{o.projectName}</td>
                  <td className="px-6 py-3">
                    <StatusPill status={o.status} />
                  </td>
                  <td className="px-6 py-3 text-[color:var(--text-muted)]">
                    {o.createdBy}
                  </td>
                  <td className="px-6 py-3 text-[color:var(--text-muted)]">
                    {new Date(o.createdAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-[color:var(--surface-muted)]">
                        <div
                          className="h-full bg-[color:var(--primary)]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-[color:var(--text-muted)]">
                        {o.scanned}/{o.total}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <Link
                      href={`/orders/${o.id}`}
                      className="text-xs font-semibold text-[color:var(--primary)] hover:underline"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OrdersCards({ rows }: { rows: OrderRow[] }) {
  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((o) => {
        const pct = o.total === 0 ? 0 : Math.round((o.scanned / o.total) * 100);
        const done = o.status === "fulfilled";
        return (
          <li key={o.id} className="card flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <StatusPill status={o.status} />
              <span className="text-xs text-[color:var(--text-muted)]">
                {new Date(o.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div>
              <div className="text-base font-semibold">{o.projectName}</div>
              <div className="text-xs text-[color:var(--text-muted)]">
                by {o.createdBy}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs text-[color:var(--text-muted)]">
                <span>
                  {o.scanned}/{o.total} verified
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
            <Link
              href={`/orders/${o.id}`}
              className={done ? "btn btn-ghost" : "btn btn-primary"}
            >
              {done ? "View order" : "Verify delivery →"}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function EmptyState({
  filter,
  role,
}: {
  filter: FilterValue;
  role: "pm" | "installer";
}) {
  const msg =
    filter === "fulfilled"
      ? "No fulfilled orders yet. As installers verify deliveries, completed orders will show up here."
      : filter === "anomaly"
        ? "No flagged orders. That's a good sign."
        : filter === "active"
          ? role === "pm"
            ? "No active orders. Create one to get started."
            : "Nothing to verify right now. Ask your PM to create an order."
          : "No orders match this filter.";
  return (
    <div className="card p-10 text-center text-sm text-[color:var(--text-muted)]">
      {msg}
    </div>
  );
}
