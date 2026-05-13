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
  projectBarcode: string | null;
  createdAt: string;
}

export default function LogisticsApprovalsPage() {
  const user = useAuthedUser();
  const qc = useQueryClient();

  const { data, isPending, error, refetch } = useQuery({
    queryKey: queryKeys.approvalsLogistics,
    queryFn: () =>
      fetchJson<{ projects: QueueRow[] }>(
        "/api/approvals/projects?queue=logistics",
      ),
    enabled: user?.role === "logistics",
  });

  const rejectMut = useMutation({
    mutationFn: (projectId: string) =>
      fetchJson(`/api/projects/${projectId}/approval`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "logistics_reject" }),
      }),
    onSuccess: () => invalidateAllApprovalSurface(qc),
  });

  if (!user) return null;
  if (user.role !== "logistics") {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-semibold">Logistics only</h1>
        <p className="text-sm text-[color:var(--text-muted)]">
          This queue is for logistics accounts only.
        </p>
      </div>
    );
  }

  const rows = data?.projects ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Awaiting logistics</h1>
        <p className="text-sm text-[color:var(--text-muted)]">
          Open each job and scan every packing QR before activating. Installers
          reuse those same codes on site; stock updates only after their scans.
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
            <li key={p.id} className="card p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
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
                  {p.projectBarcode && (
                    <div className="mt-2 font-mono text-xs">
                      Project barcode:{" "}
                      <span className="font-semibold">{p.projectBarcode}</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/projects/${p.id}/logistics-scan`}
                    className="btn btn-primary btn-sm"
                  >
                    Scan warehouse QRs
                  </Link>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={rejectMut.isPending}
                    onClick={() => rejectMut.mutate(p.id)}
                  >
                    Reject
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
