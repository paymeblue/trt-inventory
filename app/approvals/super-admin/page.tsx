"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import { packingLineCountForStock } from "@/lib/packing-lines";
import { formatPendingPatchSummary } from "@/lib/project-pending-patch";
import { invalidateAllApprovalSurface, queryKeys } from "@/lib/query-keys";
import { useAuthedUser } from "@/components/session-context";
import { PageLoading } from "@/components/page-loading";
import { QrCodeLoader } from "@/components/qr-code-loader";
import { useToast } from "@/components/toast";

interface QueueRow {
  id: string;
  name: string;
  approvalStatus: string;
  createdAt: string;
}

interface ProjectItemRow {
  sku: string;
  name: string;
  stockQuantity: number;
}

interface ProjectDetailPayload {
  project: { id: string; name: string; approvalStatus: string };
  items: ProjectItemRow[];
}

interface MetaQueueRow {
  id: string;
  name: string;
  approvalStatus: string;
  pendingDeleteRequested: boolean;
  pendingPatch: unknown;
  createdAt: string;
}

export default function SuperAdminApprovalsPage() {
  const user = useAuthedUser();
  const qc = useQueryClient();
  const { showToast, showActionToast } = useToast();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [approveTargetId, setApproveTargetId] = useState<string | null>(null);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: queryKeys.approvalsSa,
    queryFn: () =>
      fetchJson<{ projects: QueueRow[] }>(
        "/api/approvals/projects?queue=super_admin",
      ),
    enabled: user?.role === "super_admin",
  });

  const metaQuery = useQuery({
    queryKey: queryKeys.approvalsSaMetadata,
    queryFn: () =>
      fetchJson<{ projects: MetaQueueRow[] }>(
        "/api/approvals/projects?queue=super_admin_metadata",
      ),
    enabled: user?.role === "super_admin",
  });

  const approvePreviewQuery = useQuery({
    queryKey: approveTargetId
      ? queryKeys.projectDetail(approveTargetId)
      : ["project-detail", "idle"],
    queryFn: () =>
      fetchJson<ProjectDetailPayload>(`/api/projects/${approveTargetId}`),
    enabled: !!approveTargetId,
  });

  const previewRows = useMemo(() => {
    const items = approvePreviewQuery.data?.items ?? [];
    return items.map((it) => ({
      ...it,
      lines: packingLineCountForStock(it.stockQuantity),
    }));
  }, [approvePreviewQuery.data?.items]);

  const totalPackingLines = previewRows.reduce((s, r) => s + r.lines, 0);

  const act = useMutation({
    mutationFn: async (vars: { id: string; action: string }) =>
      fetchJson<{ project: { id: string } }>(`/api/projects/${vars.id}/approval`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: vars.action }),
      }),
    onSuccess: async (_data, vars) => {
      if (vars.action === "super_admin_approve") {
        const name = approvePreviewQuery.data?.project.name ?? "The project";
        showActionToast(
          `${name} approved. Print the barcodes and hand the boxes to logistics.`,
          { label: "Print barcodes", href: `/projects/${vars.id}/print-barcodes` },
        );
      }
      await invalidateAllApprovalSurface(qc);
      setApproveTargetId(null);
    },
    onError: (err) => {
      // Never leave the super-admin staring at a stuck modal: close it
      // and say exactly what failed.
      setApproveTargetId(null);
      showToast(
        err instanceof Error ? err.message : "Approval failed — try again.",
        "error",
      );
    },
  });

  useEffect(() => {
    if (approveTargetId) cancelRef.current?.focus();
  }, [approveTargetId]);

  useEffect(() => {
    if (!approveTargetId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setApproveTargetId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [approveTargetId]);

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
  const metaRows = metaQuery.data?.projects ?? [];

  function patchSummaryLines(raw: unknown): string[] {
    return formatPendingPatchSummary(raw);
  }

  return (
    <div className="space-y-6">
      {act.isPending &&
        (act.variables?.action === "super_admin_approve" ||
          act.variables?.action === "super_admin_approve_metadata_change") && (
          <div
            className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/85 text-[color:var(--primary-foreground)]"
            aria-live="polite"
            aria-busy
          >
            <QrCodeLoader
              size={160}
              label="Approval in progress"
              theme={{
                bg: "#0d1b2a",
                border: "#1b263b",
                block: "#00b4d8",
                blockMid: "#90e0ef",
                laser: "#ff7043",
              }}
            />
            <p className="mt-8 text-xl font-semibold text-white">
              Approval in progress
            </p>
            <p className="mx-auto mt-3 max-w-sm text-center text-sm text-white/85">
              Please wait—do not close this tab or navigate away until the
              workflow finishes.
            </p>
          </div>
        )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Pending creation approval</h1>
          <p className="text-sm text-[color:var(--text-muted)]">
            New projects stay hidden from installers until you approve and
            logistics fulfills stock.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={isPending}
          onClick={() => void refetch()}
        >
          {isPending ? "Refreshing…" : "↻ Refresh"}
        </button>
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
        <PageLoading message="Loading pending projects…" />
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
                  onClick={() => setApproveTargetId(p.id)}
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

      <section className="border-t border-[color:var(--border)] pt-8">
        <h2 className="text-xl font-semibold">
          Updates &amp; delete requests for live projects
        </h2>
        <p className="mt-1 text-sm text-[color:var(--text-muted)]">
          PMs and admins can propose changes while a project is active. Confirm
          here so logistics can validate and apply (or fulfil a scheduled
          deletion).
        </p>
        {metaQuery.error && (
          <div className="mt-4 rounded-lg border border-[color:var(--danger)] p-3 text-sm text-[color:var(--danger)]">
            {(metaQuery.error as Error).message}
          </div>
        )}
        {metaQuery.isPending ? (
          <PageLoading message="Loading metadata updates…" centered={false} className="mt-4" />
        ) : metaRows.length === 0 ? (
          <p className="mt-4 text-sm text-[color:var(--text-muted)]">
            No queued metadata approvals.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {metaRows.map((p) => (
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
                  <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                    Requested{" "}
                    {new Date(p.createdAt).toLocaleString(undefined, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </div>
                  <div className="mt-2 text-xs text-[color:var(--text)]">
                    {p.pendingDeleteRequested ? (
                      <span className="font-semibold text-[color:var(--danger)]">
                        Project delete requested
                      </span>
                    ) : null}
                    {patchSummaryLines(p.pendingPatch).length > 0 ? (
                      <ul className="mt-2 list-inside list-disc space-y-0.5">
                        {patchSummaryLines(p.pendingPatch).map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                    {!p.pendingDeleteRequested &&
                    patchSummaryLines(p.pendingPatch).length === 0 ? (
                      <span className="text-[color:var(--text-muted)]">
                        No additional detail supplied.
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={act.isPending}
                    onClick={() =>
                      act.mutate({
                        id: p.id,
                        action: "super_admin_approve_metadata_change",
                      })
                    }
                  >
                    Forward to logistics
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={act.isPending}
                    onClick={() =>
                      act.mutate({
                        id: p.id,
                        action: "super_admin_reject_metadata_change",
                      })
                    }
                  >
                    Reject request
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {approveTargetId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setApproveTargetId(null);
          }}
        >
          <div
            role="dialog"
            aria-modal
            aria-labelledby="approve-logistics-heading"
            className="card flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-[color:var(--border)] px-5 py-4">
              <h2 id="approve-logistics-heading" className="text-lg font-semibold">
                Approve for logistics?
              </h2>
              <p className="mt-1 text-sm text-[color:var(--text-muted)]">
                We will create one packing QR label per unit in stock on each item
                (matching current stock quantity). Logistics must scan each label
                before the project goes live.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {approvePreviewQuery.isPending ? (
                <PageLoading
                  message="Loading project items…"
                  centered={false}
                  loader={{ size: 96 }}
                />
              ) : approvePreviewQuery.isError ? (
                <p className="text-sm text-[color:var(--danger)]">
                  Could not load project items.
                </p>
              ) : (
                <>
                  <ul className="space-y-2 text-sm">
                    {previewRows.map((row) => (
                      <li
                        key={row.sku}
                        className="flex justify-between gap-4 rounded-xl bg-[color:var(--surface-muted)] px-3 py-2"
                      >
                        <span>
                          <span className="font-medium">{row.name}</span>
                          <span className="text-[color:var(--text-muted)]">
                            {" "}
                            · {row.sku}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-xs">
                          {row.lines === 0
                            ? "0 labels"
                            : `${row.lines} label${row.lines === 1 ? "" : "s"}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {previewRows.length === 0 ? (
                    <div className="mt-4 rounded-xl border border-[color:var(--danger)]/40 bg-red-50 p-3 text-sm text-[color:var(--danger)] dark:bg-red-950/40">
                      <strong>Cannot approve:</strong> this project has no items.
                      Add items to the project before approving it for logistics.
                    </div>
                  ) : null}
                  {totalPackingLines === 0 && previewRows.length > 0 ? (
                    <p className="mt-4 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-3 text-sm">
                      Every item has stock quantity 0, so no packing labels will be
                      created. Logistics can still activate once you approve—or edit
                      quantities on the project first.
                    </p>
                  ) : null}
                  {previewRows.length > 0 ? (
                    <p className="mt-4 text-xs text-[color:var(--text-muted)]">
                      Total:{" "}
                      <strong className="text-[color:var(--text)]">
                        {totalPackingLines}
                      </strong>{" "}
                      unique packing QR{totalPackingLines === 1 ? "" : "s"}.
                    </p>
                  ) : null}
                </>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-[color:var(--border)] px-5 py-4">
              <button
                type="button"
                ref={cancelRef}
                className="btn btn-ghost"
                disabled={act.isPending}
                onClick={() => setApproveTargetId(null)}
              >
                No, cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={
                  act.isPending ||
                  approvePreviewQuery.isPending ||
                  approvePreviewQuery.isError ||
                  !approveTargetId ||
                  previewRows.length === 0
                }
                onClick={() =>
                  approveTargetId &&
                  act.mutate({ id: approveTargetId, action: "super_admin_approve" })
                }
              >
                Yes, approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
