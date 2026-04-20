"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "@/lib/swr";
import { StatusPill } from "@/components/status-pill";
import { useAuthedUser } from "@/components/session-context";
import type { OrderStatus } from "@/db/schema";

interface OrdersResponse {
  orders: {
    id: string;
    projectName: string;
    status: OrderStatus;
    createdBy: string;
    createdAt: string;
    total: number;
    scanned: number;
  }[];
}

const FILTERS: { label: string; value: OrderStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Fulfilled", value: "fulfilled" },
  { label: "Anomaly", value: "anomaly" },
];

export default function OrdersPage() {
  const user = useAuthedUser();
  const { data, isLoading, error } = useSWR<OrdersResponse>("/api/orders");
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [query, setQuery] = useState("");

  if (!user) return null;
  const { role } = user;

  const rows = (data?.orders ?? [])
    .filter((o) => (filter === "all" ? true : o.status === filter))
    .filter((o) =>
      query.trim()
        ? o.projectName.toLowerCase().includes(query.trim().toLowerCase())
        : true,
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Orders</h1>
          <p className="text-sm text-[color:var(--text-muted)]">
            All orders across projects. Click an order to inspect items and
            barcodes.
          </p>
        </div>
        {role === "pm" && (
          <Link href="/orders/new" className="btn btn-primary self-start">
            + New Order
          </Link>
        )}
      </div>

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
        <input
          className="input md:max-w-xs"
          placeholder="Search project name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {error && (
        <div className="card border-[color:var(--danger)] p-4 text-sm text-[color:var(--danger)]">
          Failed to load orders.
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--surface-muted)] text-xs uppercase tracking-wide text-[color:var(--text-muted)]">
            <tr>
              <th className="px-6 py-3 text-left">Project</th>
              <th className="px-6 py-3 text-left">Status</th>
              <th className="px-6 py-3 text-left">Created by</th>
              <th className="px-6 py-3 text-left">Created</th>
              <th className="px-6 py-3 text-left">Progress</th>
              <th className="px-6 py-3"></th>
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
                      Open →
                    </Link>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && !isLoading && (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-10 text-center text-sm text-[color:var(--text-muted)]"
                >
                  No orders match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
