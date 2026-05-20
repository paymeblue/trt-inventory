"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/fetch-json";
import { queryKeys } from "@/lib/query-keys";
import {
  AddressPicker,
  type SiteSelection,
} from "@/components/address-picker";
import {
  NewProjectCreateInventory,
  type NewProjectInventoryDraft,
} from "@/components/new-project-create-inventory";
import { useToast } from "@/components/toast";
import { useAuthedUser } from "@/components/session-context";
import type { ProjectApprovalStatus } from "@/db/schema";

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  archivedAt: string | null;
  createdAt: string;
  itemCount: number;
  totalStock: number;
  activeOrderCount: number;
  fulfilledOrderCount: number;
  approvalStatus: ProjectApprovalStatus;
}

interface ProjectsResponse {
  projects: ProjectRow[];
}

/**
 * Projects list. Replaces the old single global "Warehouse" page:
 * inventory now lives inside projects, and each project is created
 * with its starting items in one shot.
 */
export default function ProjectsPage() {
  const user = useAuthedUser();
  const qc = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => fetchJson<ProjectsResponse>("/api/projects"),
  });
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");

  if (!user) return null;
  const canCreateProject =
    user.role === "pm" || user.role === "super_admin";

  const projects = data?.projects ?? [];
  const filtered = query.trim()
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : projects;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-sm text-[color:var(--text-muted)]">
            Each project owns its own items. Items are unique to the project
            they belong to and can never be reused elsewhere.
          </p>
        </div>
        {canCreateProject && (
          <button
            type="button"
            onClick={() => setShowForm((s) => !s)}
            className="btn btn-primary self-start"
          >
            {showForm ? "Cancel" : "+ New project"}
          </button>
        )}
      </div>

      {showForm && canCreateProject && (
        <NewProjectForm
          onDone={async () => {
            await qc.invalidateQueries({ queryKey: queryKeys.projects });
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {projects.length > 0 && (
        <input
          className="input md:max-w-sm"
          placeholder="Search projects…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}

      {!isPending && projects.length === 0 && !canCreateProject && (
        <div className="card p-10 text-center text-sm text-[color:var(--text-muted)]">
          No projects have been shared with you yet. Ask your PM to set one up.
        </div>
      )}

      {!isPending && projects.length === 0 && canCreateProject && (
        <p className="text-sm text-[color:var(--text-muted)]">
          No projects yet. Use the card below or &quot;+ New project&quot; above
          to create one and add items.
        </p>
      )}

      {!isPending && projects.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-[color:var(--text-muted)]">
          No projects match your search.
        </p>
      )}

      {(filtered.length > 0 || (canCreateProject && !isPending && projects.length === 0)) && (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-12 sm:items-stretch">
          {filtered.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
          {canCreateProject && (
            <NewProjectPlusTile
              active={showForm}
              onActivate={() => setShowForm(true)}
            />
          )}
        </ul>
      )}
    </div>
  );
}

function approvalListLabel(status: ProjectApprovalStatus): string {
  switch (status) {
    case "pending_super_admin":
      return "Pending super-admin";
    case "pending_logistics":
      return "Awaiting logistics";
    case "rejected_super_admin":
      return "Rejected (super-admin)";
    case "rejected_logistics":
      return "Rejected (logistics)";
    default:
      return "";
  }
}

function ProjectCard({ project }: { project: ProjectRow }) {
  const user = useAuthedUser();
  const showApproval =
    user &&
    user.role !== "installer" &&
    project.approvalStatus !== "active";

  return (
    <li className="card flex h-full flex-col gap-3 p-5 sm:col-span-6 xl:col-span-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{project.name}</h2>
          {showApproval && (
            <span className="mt-1 inline-block rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-950/80 dark:text-amber-100">
              {approvalListLabel(project.approvalStatus)}
            </span>
          )}
          {project.description && (
            <p className="mt-1 line-clamp-2 text-xs text-[color:var(--text-muted)]">
              {project.description}
            </p>
          )}
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
          {new Date(project.createdAt).toLocaleDateString()}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center text-xs">
        <Stat label="Items" value={project.itemCount} />
        <Stat label="Total stock" value={project.totalStock} />
        <Stat
          label="Active orders"
          value={project.activeOrderCount}
          tone={
            project.activeOrderCount > 0 ? "text-[color:var(--info)]" : ""
          }
        />
      </div>
      <Link href={`/projects/${project.id}`} className="btn btn-ghost">
        Open project →
      </Link>
    </li>
  );
}

/** Half the width of a project card on sm+ (3/6 vs 6/12, 2/4 vs 4/12 on xl). */
function NewProjectPlusTile({
  onActivate,
  active,
}: {
  onActivate: () => void;
  active: boolean;
}) {
  return (
    <li className="flex h-full sm:col-span-3 xl:col-span-2">
      <button
        type="button"
        onClick={onActivate}
        aria-pressed={active}
        aria-label="Create new project"
        className={`group relative flex h-full min-h-44 w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-[14px] border-2 border-dashed border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-8 text-center shadow-[var(--shadow-card)] transition-all duration-300 ease-out hover:-translate-y-1 hover:border-[color:var(--primary)] hover:shadow-[0_12px_40px_-12px_color-mix(in_oklab,var(--primary)_45%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background)] active:translate-y-0 active:scale-[0.99] ${active ? "border-[color:var(--primary)] ring-2 ring-[color:var(--primary)]/30" : ""}`}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 0%, color-mix(in oklab, var(--primary) 16%, transparent), transparent 55%), linear-gradient(135deg, color-mix(in oklab, var(--primary) 8%, transparent) 0%, transparent 45%)",
          }}
        />
        <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-[color:var(--surface-muted)] text-[color:var(--text-muted)] shadow-inner transition-all duration-300 ease-out group-hover:scale-110 group-hover:bg-[color:var(--primary)] group-hover:text-[color:var(--primary-foreground)] group-hover:shadow-[0_0_24px_-4px_color-mix(in_oklab,var(--primary)_55%,transparent)]">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="h-9 w-9 transition-transform duration-300 ease-out group-hover:rotate-90"
            aria-hidden
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
        <span className="relative text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)] transition-colors duration-300 group-hover:text-[color:var(--primary)]">
          New project
        </span>
      </button>
    </li>
  );
}

function Stat({
  label,
  value,
  tone = "",
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="rounded-lg bg-[color:var(--surface-muted)] py-2">
      <div className={`text-lg font-bold ${tone}`}>{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
        {label}
      </div>
    </div>
  );
}

const emptyInventoryDraft: NewProjectInventoryDraft = {
  categories: [],
  lines: [],
  payload: { categoryDefinitions: [], inventory: [] },
  totalUnits: 0,
};

function NewProjectForm({
  onDone,
  onCancel,
}: {
  onDone: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const user = useAuthedUser();
  const { showToast } = useToast();
  const [step, setStep] = useState<"compose" | "review">("compose");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [site, setSite] = useState<SiteSelection | null>(null);
  const [inventoryDraft, setInventoryDraft] =
    useState<NewProjectInventoryDraft>(emptyInventoryDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const siteRequired = user?.role === "pm";

  function validateCompose(): string | null {
    if (!name.trim()) return "Enter a project name.";
    if (siteRequired && !site) {
      return "Pick a site address from the Google suggestions.";
    }
    return null;
  }

  function goToReview() {
    const msg = validateCompose();
    if (msg) {
      setError(msg);
      return;
    }
    setError(null);
    setStep("review");
  }

  async function submitForReview() {
    const msg = validateCompose();
    if (msg) {
      setError(msg);
      setStep("compose");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          categoryDefinitions: inventoryDraft.payload.categoryDefinitions,
          inventory: inventoryDraft.payload.inventory,
          ...(site
            ? {
                siteAddress: site.siteAddress,
                siteLatitude: site.siteLatitude,
                siteLongitude: site.siteLongitude,
              }
            : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        project?: { approvalStatus?: string };
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to submit project");

      showToast("Project in review — waiting for super-admin approval.");
      await onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const namedCategories = inventoryDraft.categories.filter(
    (c) => c.name.trim().length > 0,
  );

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">New project</h2>
          <p className="mt-1 text-xs text-[color:var(--text-muted)]">
            {step === "compose"
              ? "Add details, categories, and items. Super-admin reviews before the project goes live."
              : "Check everything below, then submit for super-admin review."}
          </p>
        </div>
        <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
          Step {step === "compose" ? "1" : "2"} of 2
        </span>
      </div>

      {step === "compose" ? (
        <div className="mt-6 space-y-6">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
              Project name
            </span>
            <input
              required
              autoFocus
              maxLength={120}
              className="input"
              placeholder="e.g. Lekki Phase 2 – Block C"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
              Description (optional)
            </span>
            <textarea
              className="input"
              rows={2}
              maxLength={500}
              placeholder="Short note so the team knows what this project is about."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <AddressPicker
            value={site}
            onChange={setSite}
            required={siteRequired}
          />

          <div className="border-t border-[color:var(--border)] pt-6">
            <NewProjectCreateInventory onDraftChange={setInventoryDraft} />
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <div className="overflow-hidden rounded-lg border border-[color:var(--border)]">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-[color:var(--border)]">
                <tr className="bg-[color:var(--surface-muted)]/50">
                  <th className="w-36 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
                    Project
                  </th>
                  <td className="px-4 py-2.5 font-medium">{name.trim()}</td>
                </tr>
                {description.trim() ? (
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
                      Description
                    </th>
                    <td className="px-4 py-2.5 text-[color:var(--text-muted)]">
                      {description.trim()}
                    </td>
                  </tr>
                ) : null}
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
                    Site
                  </th>
                  <td className="px-4 py-2.5">
                    {site ? (
                      <span>
                        {site.siteAddress}
                        <span className="ml-2 font-mono text-[10px] text-[color:var(--text-muted)]">
                          ({site.siteLatitude.toFixed(5)},{" "}
                          {site.siteLongitude.toFixed(5)})
                        </span>
                      </span>
                    ) : (
                      <span className="text-[color:var(--text-muted)]">—</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {namedCategories.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
                Categories ({namedCategories.length})
              </h3>
              <div className="overflow-hidden rounded-lg border border-[color:var(--border)]">
                <table className="w-full text-sm">
                  <thead className="bg-[color:var(--surface-muted)] text-xs uppercase tracking-wide text-[color:var(--text-muted)]">
                    <tr>
                      <th className="px-4 py-2 text-left">Name</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--border)]">
                    {namedCategories.map((c) => (
                      <tr key={c.localId}>
                        <td className="px-4 py-2 font-medium">{c.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
              Items ({inventoryDraft.lines.length} lines ·{" "}
              {inventoryDraft.totalUnits} units)
            </h3>
            <div className="overflow-hidden rounded-lg border border-[color:var(--border)]">
              <table className="w-full text-sm">
                <thead className="bg-[color:var(--surface-muted)] text-xs uppercase tracking-wide text-[color:var(--text-muted)]">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Label</th>
                    <th className="px-4 py-2.5 text-left">Type</th>
                    <th className="px-4 py-2.5 text-right">Units</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--border)]">
                  {inventoryDraft.lines.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-6 text-center text-xs text-[color:var(--text-muted)]"
                      >
                        No items queued — you can still submit; add stock later
                        on the project page after approval.
                      </td>
                    </tr>
                  ) : (
                    inventoryDraft.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="px-4 py-2.5 font-medium">
                          {l.kind === "category" ? l.label : l.name}
                        </td>
                        <td className="px-4 py-2.5 capitalize text-[color:var(--text-muted)]">
                          {l.kind}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono">
                          {l.quantity}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className="rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
            Submitting sends this project to the super-admin queue. It is not
            active for installers or logistics until approved.
          </p>
        </div>
      )}

      {error ? (
        <div className="mt-4 rounded-lg border border-[color:var(--danger)] bg-red-50 px-3 py-2 text-sm text-[color:var(--danger)] dark:bg-red-950/30">
          {error}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="btn btn-ghost"
        >
          Cancel
        </button>
        {step === "compose" ? (
          <button
            type="button"
            disabled={busy || !name.trim()}
            className="btn btn-primary"
            onClick={goToReview}
          >
            Move to review →
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              className="btn btn-ghost"
              onClick={() => {
                setError(null);
                setStep("compose");
              }}
            >
              ← Back to edit
            </button>
            <button
              type="button"
              disabled={busy}
              className="btn btn-primary"
              onClick={() => void submitForReview()}
            >
              {busy ? "Submitting…" : "Submit for review"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
