"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "@/lib/swr";
import { useAuthedUser } from "@/components/session-context";

interface ProjectSummary {
  id: string;
  name: string;
  itemCount: number;
}

interface ProjectsResponse {
  projects: ProjectSummary[];
}

/**
 * PM creates a new order by picking an existing project. The order
 * inherits the project's item scope — no items from other projects
 * can ever be added to it.
 *
 * Accepts `?projectId=` in the URL so the project detail page can
 * deep-link the PM straight into a pre-selected project.
 */
export default function NewOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthedUser();
  const { data, isLoading } = useSWR<ProjectsResponse>("/api/projects");
  const [projectId, setProjectId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const pre = searchParams?.get("projectId");
    if (pre) setProjectId(pre);
  }, [searchParams]);

  if (!user) return null;
  const { role } = user;

  if (role !== "pm") {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-semibold">PM only</h1>
        <p className="text-sm text-[color:var(--text-muted)]">
          Installers don&apos;t create orders. Head back to{" "}
          <Link
            href="/orders"
            className="font-semibold text-[color:var(--primary)]"
          >
            Orders
          </Link>
          .
        </p>
      </div>
    );
  }

  const projects = data?.projects ?? [];
  const selected = projects.find((p) => p.id === projectId);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create order");
      router.push(`/orders/${json.order.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New order</h1>
        <p className="text-sm text-[color:var(--text-muted)]">
          Pick the project this delivery belongs to. On the next screen you&apos;ll
          choose which of the project&apos;s items to include, print their barcodes,
          and hand the order off to an installer.
        </p>
      </div>

      <form onSubmit={onSubmit} className="card space-y-4 p-6">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            Project
          </span>
          <select
            required
            className="input"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            disabled={isLoading}
          >
            <option value="" disabled>
              {isLoading ? "Loading projects…" : "Select a project"}
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.itemCount} item{p.itemCount === 1 ? "" : "s"})
              </option>
            ))}
          </select>
        </label>

        {selected && selected.itemCount === 0 && (
          <div className="rounded-lg border border-[color:var(--warning)] bg-amber-50 px-3 py-2 text-xs text-[color:var(--warning)]">
            This project has no items yet. You can still create the order, but
            you&apos;ll need to add items to the project before anything is
            scannable.{" "}
            <Link
              href={`/projects/${selected.id}`}
              className="font-semibold underline"
            >
              Add items →
            </Link>
          </div>
        )}

        {projects.length === 0 && !isLoading && (
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-xs text-[color:var(--text-muted)]">
            You haven&apos;t created any projects yet.{" "}
            <Link
              href="/projects"
              className="font-semibold text-[color:var(--primary)]"
            >
              Create one first →
            </Link>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-[color:var(--danger)] bg-red-50 px-3 py-2 text-sm text-[color:var(--danger)]">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => router.push("/orders")}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !projectId}
          >
            {busy ? "Creating…" : "Create order"}
          </button>
        </div>
      </form>
    </div>
  );
}
