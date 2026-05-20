"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/fetch-json";
import { invalidateAllApprovalSurface, queryKeys } from "@/lib/query-keys";
import { useAuthedUser } from "@/components/session-context";
import { PageLoading } from "@/components/page-loading";

interface QueueRow {
  id: string;
  name: string;
  approvalStatus: string;
  projectBarcode: string | null;
  createdAt: string;
}

interface LogisticsMetaRow {
  id: string;
  name: string;
  approvalStatus: string;
  projectBarcode: string | null;
  pendingDeleteRequested: boolean;
  pendingPatch: unknown;
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
    enabled: user?.role === "logistics" || user?.role === "super_admin",
  });

  const metaQuery = useQuery({
    queryKey: queryKeys.approvalsLogisticsMetadata,
    queryFn: () =>
      fetchJson<{ projects: LogisticsMetaRow[] }>(
        "/api/approvals/projects?queue=logistics_metadata",
      ),
    enabled: user?.role === "logistics" || user?.role === "super_admin",
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

  const applyMetaMut = useMutation({
    mutationFn: (projectId: string) =>
      fetchJson(`/api/projects/${projectId}/approval`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "logistics_apply_patch" }),
      }),
    onSuccess: () => invalidateAllApprovalSurface(qc),
  });

  const rejectMetaMut = useMutation({
    mutationFn: (projectId: string) =>
      fetchJson(`/api/projects/${projectId}/approval`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "logistics_reject_metadata_change" }),
      }),
    onSuccess: () => invalidateAllApprovalSurface(qc),
  });

  if (!user) return null;
  if (user.role !== "logistics" && user.role !== "super_admin") {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-semibold">Awaiting logistics</h1>
        <p className="text-sm text-[color:var(--text-muted)]">
          This queue is for logistics or super-admin accounts.
        </p>
      </div>
    );
  }

  const rows = data?.projects ?? [];
  const metaRows = metaQuery.data?.projects ?? [];

  function patchKeys(raw: unknown): string {
    if (!raw || typeof raw !== "object") return "";
    return Object.keys(raw as object).join(", ");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Awaiting logistics</h1>
        <p className="text-sm text-[color:var(--text-muted)]">
          This is the critical warehouse step: scan every packing QR here before
          activating. Receivers reuse the same stickers on site only after you
          finish this list.
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
        <PageLoading message="Loading logistics queue…" />
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

      <section className="border-t border-[color:var(--border)] pt-8">
        <h2 className="text-xl font-semibold">Apply PM / admin updates</h2>
        <p className="mt-1 text-sm text-[color:var(--text-muted)]">
          Super-admin forwarded these changes. Confirm to put new field values
          live, or fulfil a delete once any orders are cleared.
        </p>
        {metaQuery.error ? (
          <p className="mt-3 text-sm text-[color:var(--danger)]">
            {(metaQuery.error as Error).message}
          </p>
        ) : null}
        {metaQuery.isPending ? (
          <PageLoading message="Loading metadata queue…" centered={false} className="mt-4" />
        ) : metaRows.length === 0 ? (
          <p className="mt-4 text-sm text-[color:var(--text-muted)]">
            No pending updates.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {metaRows.map((p) => (
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
                    <div className="mt-2 text-xs text-[color:var(--text)]">
                      {p.pendingDeleteRequested ? (
                        <span className="font-semibold text-[color:var(--danger)]">
                          Delete project after checks
                        </span>
                      ) : null}
                      {p.pendingDeleteRequested && patchKeys(p.pendingPatch)
                        ? " · "
                        : null}
                      {patchKeys(p.pendingPatch) ? (
                        <span>Updates: {patchKeys(p.pendingPatch)}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={
                        applyMetaMut.isPending ||
                        rejectMetaMut.isPending ||
                        rejectMut.isPending
                      }
                      onClick={() => applyMetaMut.mutate(p.id)}
                    >
                      Confirm apply
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={
                        applyMetaMut.isPending ||
                        rejectMetaMut.isPending ||
                        rejectMut.isPending
                      }
                      onClick={() => rejectMetaMut.mutate(p.id)}
                    >
                      Reject changes
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
