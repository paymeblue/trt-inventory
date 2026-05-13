"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/fetch-json";
import { invalidateAllApprovalSurface, queryKeys } from "@/lib/query-keys";
import { useAuthedUser } from "@/components/session-context";

interface QueueRow {
  id: string;
  name: string;
  approvalStatus: string;
  createdAt: string;
}

export default function SuperAdminApprovalsPage() {
  const user = useAuthedUser();
  const qc = useQueryClient();

  const { data, isPending, error, refetch } = useQuery({
    queryKey: queryKeys.approvalsSa,
    queryFn: () =>
      fetchJson<{ projects: QueueRow[] }>(
        "/api/approvals/projects?queue=super_admin",
      ),
    enabled: user?.role === "super_admin",
  });

  const act = useMutation({
    mutationFn: async (vars: { id: string; action: string }) =>
      fetchJson<{ project: { id: string } }>(`/api/projects/${vars.id}/approval`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: vars.action }),
      }),
    onSuccess: () => invalidateAllApprovalSurface(qc),
  });

  if (!user) return null;
  if (user.role !== "super_admin") {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-semibold">Super-admin only</h1>
        <p className="text-sm text-[color:var(--text-muted)]">
          This queue is for super-admin accounts only.
        </p>
      </div>
    );
  }

  const rows = data?.projects ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Pending creation approval</h1>
        <p className="text-sm text-[color:var(--text-muted)]">
          New projects stay hidden from installers until you approve and
          logistics fulfills stock.
        </p>
      </div>

      {error && (
        <div className="card border-[color:var(--danger)] p-4 text-sm text-[color:var(--danger)]">
          {(error as Error).message}
          <button type="button" className="btn btn-ghost ml-4" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      )}

      {isPending ? (
        <p className="text-sm text-[color:var(--text-muted)]">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[color:var(--text-muted)]">Nothing waiting.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((p) => (
            <li
              key={p.id}
              className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <Link
                  href={`/projects/${p.id}`}
                  className="font-semibold hover:underline"
                >
                  {p.name}
                </Link>
                <div className="text-xs text-[color:var(--text-muted)]">
                  {new Date(p.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={act.isPending}
                  onClick={() =>
                    act.mutate({ id: p.id, action: "super_admin_approve" })
                  }
                >
                  Approve → logistics
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  disabled={act.isPending}
                  onClick={() =>
                    act.mutate({ id: p.id, action: "super_admin_reject" })
                  }
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
