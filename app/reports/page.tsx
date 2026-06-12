"use client";

import { useMemo, useState } from "react";
import useSWR from "@/lib/swr";
import { useAuthedUser } from "@/components/session-context";
import { PageLoading } from "@/components/page-loading";
import type { ReportRow } from "@/app/api/reports/route";

interface ReportsResponse {
  rows: ReportRow[];
}

export default function ReportsPage() {
  const user = useAuthedUser();
  const { data, isLoading, error } = useSWR<ReportsResponse>("/api/reports");
  const [query, setQuery] = useState("");

  const rows = data?.rows ?? [];

  const filtered = useMemo(
    () =>
      rows.filter((r) =>
        query.trim()
          ? r.projectName.toLowerCase().includes(query.trim().toLowerCase()) ||
            (r.installerName ?? "").toLowerCase().includes(query.trim().toLowerCase())
          : true,
      ),
    [rows, query],
  );

  if (!user) return null;

  if (user.role === "installer") {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-semibold">Reports</h1>
        <p className="text-sm text-[color:var(--text-muted)]">
          Reports are available to PMs, logistics, and super-admins.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-[color:var(--text-muted)]">
            All fulfilled orders — searchable and downloadable as CSV.
          </p>
        </div>
        {rows.length > 0 && (
          <button
            type="button"
            className="btn btn-primary self-start"
            onClick={() => downloadCsv(filtered)}
          >
            Download CSV
          </button>
        )}
      </div>

      <div>
        <input
          className="input md:max-w-xs"
          placeholder="Search project or installer…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {error && (
        <div className="card border-[color:var(--danger)] p-4 text-sm text-[color:var(--danger)]">
          Failed to load reports.
        </div>
      )}

      {isLoading ? (
        <PageLoading message="Loading reports…" />
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center text-sm text-[color:var(--text-muted)]">
          {rows.length === 0
            ? "No fulfilled orders yet. Completed orders will appear here."
            : "No orders match this search."}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--surface-muted)] text-xs uppercase tracking-wide text-[color:var(--text-muted)]">
                <tr>
                  <th className="px-5 py-3 text-left">Project</th>
                  <th className="px-5 py-3 text-left">Created by (PM)</th>
                  <th className="px-5 py-3 text-left">Receiver / Installer</th>
                  <th className="px-5 py-3 text-left">Fulfilled</th>
                  <th className="px-5 py-3 text-left">Items</th>
                  <th className="px-5 py-3 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--border)]">
                {filtered.map((r) => (
                  <tr key={r.orderId} className="hover:bg-[color:var(--surface-muted)]">
                    <td className="px-5 py-3 font-medium">{r.projectName}</td>
                    <td className="px-5 py-3 text-[color:var(--text-muted)]">{r.pmName}</td>
                    <td className="px-5 py-3 text-[color:var(--text-muted)]">
                      {r.installerName ?? <span className="italic opacity-50">Unassigned</span>}
                    </td>
                    <td className="px-5 py-3 text-[color:var(--text-muted)]">
                      {new Date(r.fulfilledAt).toLocaleString()}
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                        {r.itemCount}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <a
                        href={`/orders/${r.orderId}`}
                        className="text-xs font-semibold text-[color:var(--primary)] hover:underline"
                      >
                        View order →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-[color:var(--border)] px-5 py-3 text-xs text-[color:var(--text-muted)]">
            {filtered.length} fulfilled order{filtered.length === 1 ? "" : "s"}
          </div>
        </div>
      )}
    </div>
  );
}

function downloadCsv(rows: ReportRow[]) {
  const headers = [
    "Order ID",
    "Project",
    "Created by (PM)",
    "Receiver / Installer",
    "Fulfilled Date",
    "Item Count",
    "Item SKUs",
    "Barcodes",
  ];
  const escape = (v: string) =>
    v.includes(",") || v.includes('"') || v.includes("\n")
      ? `"${v.replace(/"/g, '""')}"`
      : v;
  const csvLines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        escape(r.orderId),
        escape(r.projectName),
        escape(r.pmName),
        escape(r.installerName ?? ""),
        escape(new Date(r.fulfilledAt).toLocaleString()),
        String(r.itemCount),
        escape(r.items.map((i) => i.sku).join("; ")),
        escape(r.items.map((i) => i.barcode).join("; ")),
      ].join(","),
    ),
  ];
  const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fulfilled-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
