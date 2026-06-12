'use client';

import Link from 'next/link';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/fetch-json';
import { invalidateWorkspaceBadges, queryKeys } from '@/lib/query-keys';
import {
  NewProjectCreateInventory,
  type NewProjectInventoryDraft,
} from '@/components/new-project-create-inventory';
import { useToast } from '@/components/toast';
import { useAuthedUser } from '@/components/session-context';
import type { ProjectApprovalStatus, Role } from '@/db/schema';

interface UserRow {
  id: string;
  name: string;
  role: Role;
}

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
    queryFn: () => fetchJson<ProjectsResponse>('/api/projects'),
  });
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState('');

  if (!user) return null;
  const canCreateProject = user.role === 'pm' || user.role === 'super_admin';

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
            {showForm ? 'Cancel' : '+ New project'}
          </button>
        )}
      </div>

      {showForm && canCreateProject && (
        <NewProjectForm
          onDone={async () => {
            await Promise.all([
              qc.invalidateQueries({ queryKey: queryKeys.projects }),
              invalidateWorkspaceBadges(qc),
            ]);
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

      {canCreateProject && <PrintBarcodesGateModal projects={projects} />}

      {(filtered.length > 0 ||
        (canCreateProject && !isPending && projects.length === 0)) && (
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
    case 'pending_super_admin':
      return 'Pending super-admin';
    case 'pending_logistics':
      return 'Awaiting logistics';
    case 'rejected_super_admin':
      return 'Rejected (super-admin)';
    case 'rejected_logistics':
      return 'Rejected (logistics)';
    default:
      return '';
  }
}

function ProjectCard({ project }: { project: ProjectRow }) {
  const user = useAuthedUser();
  const showApproval =
    user && user.role !== 'installer' && project.approvalStatus !== 'active';
  const canPrintBarcodes =
    !!user &&
    (user.role === 'pm' || user.role === 'super_admin') &&
    project.approvalStatus === 'pending_logistics';

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
          tone={project.activeOrderCount > 0 ? 'text-[color:var(--info)]' : ''}
        />
      </div>
      {project.approvalStatus === 'pending_super_admin' ? (
        <div className="btn btn-ghost cursor-default text-center text-xs text-[color:var(--text-muted)]">
          Please contact Super admin for approval
        </div>
      ) : (
        <>
          {canPrintBarcodes && (
            <Link
              href={`/projects/${project.id}/print-barcodes`}
              className="btn btn-primary"
            >
              Approved project barcodes
            </Link>
          )}
          <Link href={`/projects/${project.id}`} className="btn btn-ghost">
            Open project →
          </Link>
        </>
      )}
    </li>
  );
}

const PRINT_ACK_PREFIX = 'trt:print-barcodes-ack:';

const emptySubscribe = () => () => {};

/**
 * Full-screen modal shown to PMs the moment a project clears super-admin
 * approval: they must print the packing barcodes and stick them on the
 * physical boxes before logistics can scan anything. Acknowledged once
 * per project (localStorage) so it stops nagging after they go print.
 */
function PrintBarcodesGateModal({ projects }: { projects: ProjectRow[] }) {
  // SSR-safe mount detection without setState-in-effect: false on the
  // server snapshot, true on the client, so localStorage is only read
  // after hydration.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const [dismissedIds, setDismissedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  if (!mounted) return null;
  const target = projects.find(
    (p) =>
      p.approvalStatus === 'pending_logistics' &&
      !dismissedIds.has(p.id) &&
      !localStorage.getItem(PRINT_ACK_PREFIX + p.id),
  );
  if (!target) return null;

  function acknowledge() {
    if (!target) return;
    localStorage.setItem(PRINT_ACK_PREFIX + target.id, '1');
    setDismissedIds((prev) => new Set(prev).add(target.id));
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal
        aria-labelledby="print-barcodes-gate-heading"
        className="card w-full max-w-2xl p-8 text-center"
      >
        <span
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[color:var(--primary)]/10 text-[color:var(--primary)]"
          aria-hidden
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-9 w-9"
          >
            <path d="M6 9V2h12v7" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
        </span>
        <h2
          id="print-barcodes-gate-heading"
          className="mt-4 text-2xl font-semibold"
        >
          “{target.name}” has been approved!
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-sm text-[color:var(--text-muted)]">
          Before anything else, you <strong>must print the barcodes</strong>{' '}
          for this project and paste one sticker on each physical box.
          Logistics cannot scan or verify the shipment until the stickers are
          on the boxes.
        </p>
        <ol className="mx-auto mt-5 max-w-md space-y-2 text-left text-sm">
          <li className="rounded-lg bg-[color:var(--surface-muted)] px-4 py-2">
            1. Print the packing barcodes for this project.
          </li>
          <li className="rounded-lg bg-[color:var(--surface-muted)] px-4 py-2">
            2. Paste one sticker on each physical box.
          </li>
          <li className="rounded-lg bg-[color:var(--surface-muted)] px-4 py-2">
            3. Hand the boxes to logistics — they scan each sticker to verify.
          </li>
        </ol>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href={`/projects/${target.id}/print-barcodes`}
            className="btn btn-primary px-8 py-3 text-base"
            onClick={acknowledge}
          >
            Print barcodes now →
          </Link>
          <button
            type="button"
            className="btn btn-ghost text-sm"
            onClick={acknowledge}
          >
            I already printed them
          </button>
        </div>
      </div>
    </div>
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
        className={`group relative flex h-full min-h-44 w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-[14px] border-2 border-dashed border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-8 text-center shadow-[var(--shadow-card)] transition-all duration-300 ease-out hover:-translate-y-1 hover:border-[color:var(--primary)] hover:shadow-[0_12px_40px_-12px_color-mix(in_oklab,var(--primary)_45%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background)] active:translate-y-0 active:scale-[0.99] ${active ? 'border-[color:var(--primary)] ring-2 ring-[color:var(--primary)]/30' : ''}`}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% 0%, color-mix(in oklab, var(--primary) 16%, transparent), transparent 55%), linear-gradient(135deg, color-mix(in oklab, var(--primary) 8%, transparent) 0%, transparent 45%)',
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
  tone = '',
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
  const [step, setStep] = useState<'compose' | 'review'>('compose');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [installerUserId, setInstallerUserId] = useState('');
  const [inventoryDraft, setInventoryDraft] =
    useState<NewProjectInventoryDraft>(emptyInventoryDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => fetchJson<{ users: UserRow[] }>('/api/users'),
    enabled: user?.role === 'pm' || user?.role === 'super_admin',
  });
  const installers = useMemo(
    () => (usersData?.users ?? []).filter((u) => u.role === 'installer'),
    [usersData],
  );
  const selectedInstaller = useMemo(
    () => installers.find((u) => u.id === installerUserId) ?? null,
    [installers, installerUserId],
  );

  function validateCompose(): string | null {
    if (!name.trim()) return 'Enter a project name.';
    return null;
  }

  function goToReview() {
    const msg = validateCompose();
    if (msg) {
      setError(msg);
      return;
    }
    setError(null);
    setStep('review');
  }

  async function submitForReview() {
    const msg = validateCompose();
    if (msg) {
      setError(msg);
      setStep('compose');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          installerUserId: installerUserId || undefined,
          categoryDefinitions: inventoryDraft.payload.categoryDefinitions,
          inventory: inventoryDraft.payload.inventory,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        project?: { approvalStatus?: string };
      };
      if (!res.ok) throw new Error(json.error ?? 'Failed to submit project');

      showToast('Project in review — waiting for super-admin approval.');
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
            {step === 'compose'
              ? 'Add details, categories, and items. Super-admin reviews before the project goes live.'
              : 'Check everything below, then submit for super-admin review.'}
          </p>
        </div>
        <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
          Step {step === 'compose' ? '1' : '2'} of 2
        </span>
      </div>

      {/* Compose step — always mounted so inventory state is preserved when going back */}
      <div className={step === 'compose' ? 'mt-6 space-y-6' : 'hidden'}>
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
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            Assign receiver (optional)
          </span>
          <select
            className="input w-full"
            value={installerUserId}
            onChange={(e) => setInstallerUserId(e.target.value)}
          >
            <option value="">— Unassigned (Anyone can receive) —</option>
            {installers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          {installers.length === 0 && usersData ? (
            <p className="mt-1 text-xs text-[color:var(--text-muted)]">
              No receiver accounts found. Create one under Team first.
            </p>
          ) : null}
        </label>

        <div className="border-t border-[color:var(--border)] pt-6">
          <NewProjectCreateInventory onDraftChange={setInventoryDraft} />
        </div>
      </div>

      {/* Review step */}
      {step === 'review' ? (
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
                {selectedInstaller ? (
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
                      Receiver
                    </th>
                    <td className="px-4 py-2.5 font-medium">
                      {selectedInstaller.name}
                    </td>
                  </tr>
                ) : null}
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
              Items ({inventoryDraft.lines.length} lines ·{' '}
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
                          {l.kind === 'category' ? l.label : l.name}
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
      ) : null}

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
        {step === 'compose' ? (
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
                setStep('compose');
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
              {busy ? 'Submitting…' : 'Submit for review'}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
