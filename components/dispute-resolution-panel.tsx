"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  DisputeCategory,
  DisputePriority,
  DisputeStatus,
} from "@/db/schema";
import { fetchJson } from "@/lib/fetch-json";
import { invalidateAfterDisputeAction } from "@/lib/query-keys";
import {
  DISPUTE_CATEGORY_OPTIONS,
  DISPUTE_PRIORITY_OPTIONS,
  disputeCategoryLabel,
  disputePriorityLabel,
  disputeStatusLabel,
  disputeStatusPill,
} from "@/lib/dispute-labels";
import {
  allowedTransitions,
  canManageDisputes,
  isDisputeMessagingOpen,
  transitionButtonLabel,
  type DisputeTransition,
} from "@/lib/dispute-resolution";
import { useAuthedUser } from "@/components/session-context";

export interface DisputeResolutionPanelProps {
  disputeId: string;
  status: DisputeStatus;
  category: DisputeCategory | null;
  priority: DisputePriority;
  resolutionSummary: string | null;
  assigneeName: string | null;
}

export function DisputeResolutionPanel({
  disputeId,
  status,
  category,
  priority,
  resolutionSummary,
  assigneeName,
}: DisputeResolutionPanelProps) {
  const user = useAuthedUser();
  const qc = useQueryClient();
  const [resolveSummary, setResolveSummary] = useState(
    resolutionSummary ?? "",
  );
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patchMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJson(`/api/disputes/${disputeId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      setError(null);
      setShowResolveForm(false);
      await invalidateAfterDisputeAction(qc, disputeId);
    },
    onError: (e) => setError((e as Error).message),
  });

  if (!user) return null;

  const manager = canManageDisputes(user.role);
  const transitions = allowedTransitions(status);

  function runTransition(t: DisputeTransition) {
    if (t === "resolve") {
      setShowResolveForm(true);
      return;
    }
    patchMut.mutate({ transition: t });
  }

  function submitResolve() {
    const s = resolveSummary.trim();
    if (!s) {
      setError("Enter a resolution summary before marking resolved.");
      return;
    }
    patchMut.mutate({ transition: "resolve", resolutionSummary: s });
  }

  return (
    <section className="card space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Resolution workflow</h2>
          <p className="mt-1 text-xs text-[color:var(--text-muted)]">
            Standard path: open → under review → awaiting response → resolved →
            closed. Export PDF or Word at any time for evidence.
          </p>
        </div>
        <span className={`${disputeStatusPill(status)} text-xs`}>
          {disputeStatusLabel(status)}
        </span>
      </div>

      <dl className="grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            Category
          </dt>
          <dd className="mt-0.5">{disputeCategoryLabel(category)}</dd>
        </div>
        <div>
          <dt className="font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            Priority
          </dt>
          <dd className="mt-0.5">{disputePriorityLabel(priority)}</dd>
        </div>
        {assigneeName ? (
          <div>
            <dt className="font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
              Assignee
            </dt>
            <dd className="mt-0.5">{assigneeName}</dd>
          </div>
        ) : null}
        {resolutionSummary ? (
          <div className="sm:col-span-2">
            <dt className="font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
              Resolution
            </dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-[color:var(--text)]">
              {resolutionSummary}
            </dd>
          </div>
        ) : null}
      </dl>

      {!isDisputeMessagingOpen(status) && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          This case is {disputeStatusLabel(status).toLowerCase()}. New replies are
          locked unless a coordinator reopens it.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <a
          className="btn btn-ghost btn-sm"
          href={`/api/disputes/${disputeId}/export?format=pdf`}
          download
        >
          Export PDF
        </a>
        <a
          className="btn btn-ghost btn-sm"
          href={`/api/disputes/${disputeId}/export?format=docx`}
          download
        >
          Export Word
        </a>
      </div>

      {manager && transitions.length > 0 ? (
        <div className="space-y-3 border-t border-[color:var(--border)] pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            Coordinator actions
          </p>
          <div className="flex flex-wrap gap-2">
            {transitions.map((t) => (
              <button
                key={t}
                type="button"
                className="btn btn-primary btn-sm"
                disabled={patchMut.isPending}
                onClick={() => runTransition(t)}
              >
                {transitionButtonLabel(t)}
              </button>
            ))}
          </div>

          {showResolveForm ? (
            <div className="space-y-2">
              <label className="block text-xs font-semibold">
                Resolution summary (required for evidence)
              </label>
              <textarea
                className="input min-h-[100px]"
                value={resolveSummary}
                onChange={(e) => setResolveSummary(e.target.value)}
                placeholder="What was decided, who is accountable, and what happens next…"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={patchMut.isPending}
                  onClick={() => submitResolve()}
                >
                  Confirm resolved
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowResolveForm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs">
              <span className="mb-1 block font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
                Priority
              </span>
              <select
                className="input"
                value={priority}
                disabled={patchMut.isPending}
                onChange={(e) =>
                  patchMut.mutate({
                    priority: e.target.value as DisputePriority,
                  })
                }
              >
                {DISPUTE_PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {disputePriorityLabel(p)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
                Category
              </span>
              <select
                className="input"
                value={category ?? ""}
                disabled={patchMut.isPending}
                onChange={(e) =>
                  patchMut.mutate({
                    category: (e.target.value || null) as DisputeCategory | null,
                  })
                }
              >
                <option value="">Uncategorized</option>
                {DISPUTE_CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {disputeCategoryLabel(c)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-xs text-[color:var(--danger)]">{error}</p>
      ) : null}
    </section>
  );
}
