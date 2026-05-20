"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/fetch-json";
import { useAuthedUser } from "@/components/session-context";
import { PageLoading } from "@/components/page-loading";
import {
  disputeCategoryLabel,
  disputePriorityLabel,
  disputeStatusLabel,
  disputeStatusPill,
} from "@/lib/dispute-labels";
import type { DisputeCategory, DisputePriority, DisputeStatus } from "@/db/schema";

interface DisputeListRow {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  projectId: string | null;
  orderId: string | null;
  photoPath: string | null;
  creatorName: string | null;
  status: DisputeStatus;
  category: DisputeCategory | null;
  priority: DisputePriority;
}

export default function DisputesListPage() {
  const user = useAuthedUser();
  const { data, error, refetch, isPending } = useQuery({
    queryKey: ["disputes", "list"],
    queryFn: () => fetchJson<{ disputes: DisputeListRow[] }>("/api/disputes"),
    enabled: !!user,
    refetchInterval: 20_000,
  });

  if (!user) return null;

  const rows = data?.disputes ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Disputes</h1>
          <p className="max-w-xl text-sm text-[color:var(--text-muted)]">
            Formal dispute records with status workflow, audit trail, and PDF or
            Word export for evidence. Logistics and super-admin triage open cases.
          </p>
        </div>
        <Link href="/disputes/new" className="btn btn-primary self-start">
          New dispute
        </Link>
      </div>

      {error && (
        <div className="card border-[color:var(--danger)] p-4 text-sm text-[color:var(--danger)]">
          {(error as Error).message}
          <button type="button" className="btn btn-ghost ml-3" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      )}

      {isPending ? (
        <PageLoading message="Loading disputes…" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-[color:var(--text-muted)]">
          Nothing here yet—open{" "}
          <Link href="/disputes/new" className="font-semibold text-[color:var(--primary)]">
            New dispute
          </Link>{" "}
          if something blocked you.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((d) => (
            <li key={d.id}>
              <Link
                href={`/disputes/${d.id}`}
                className="card block p-4 transition-colors hover:bg-[color:var(--surface-muted)]/60"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="font-semibold">{d.title}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`${disputeStatusPill(d.status)} text-[10px]`}>
                      {disputeStatusLabel(d.status)}
                    </span>
                    <span className="text-xs text-[color:var(--text-muted)]">
                      {new Date(d.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-[color:var(--text-muted)]">
                  {d.description}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
                  {d.creatorName ? (
                    <span>Opened by {d.creatorName}</span>
                  ) : null}
                  <span>{disputeCategoryLabel(d.category)}</span>
                  <span>{disputePriorityLabel(d.priority)} priority</span>
                  {d.projectId ? (
                    <Link
                      href={`/projects/${d.projectId}`}
                      className="text-[color:var(--primary)]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Project
                    </Link>
                  ) : null}
                  {d.orderId ? (
                    <Link
                      href={`/orders/${d.orderId}`}
                      className="text-[color:var(--primary)]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Order
                    </Link>
                  ) : null}
                  {d.photoPath?.trim() ? (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      Attachment
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
