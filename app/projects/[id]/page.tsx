"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import useSWR from "@/lib/swr";
import {
  formatSkuSequence,
  nextSkuIndexForBase,
  skuBaseFromLabel,
} from "@/lib/sku-from-label";
import { ConfirmModal } from "@/components/confirm-modal";
import { ProjectEditPanel } from "@/components/project-edit-panel";
import { StatusPill } from "@/components/status-pill";
import { useAuthedUser } from "@/components/session-context";
import {
  METADATA_PENDING_LOGISTICS,
  METADATA_PENDING_SUPER_ADMIN,
} from "@/lib/metadata-stages";
import { queryKeys } from "@/lib/query-keys";
import type { OrderStatus, ProjectApprovalStatus, Role } from "@/db/schema";

interface Item {
  id: string;
  projectId: string;
  sku: string;
  name: string;
  stockQuantity: number;
  createdAt: string;
  categoryId?: string | null;
  batchId?: string | null;
  categoryName?: string | null;
}

interface ProjectCategory {
  id: string;
  name: string;
  createdAt: string;
}

interface OrderLite {
  id: string;
  status: OrderStatus;
  createdBy: string;
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  archivedAt: string | null;
  installerUserId: string | null;
  approvalStatus: ProjectApprovalStatus;
  pendingPatch: unknown;
  projectBarcode: string | null;
  metadataChangeStage: string | null;
  pendingDeleteRequested: boolean;
  siteAddress: string | null;
  siteLatitude: number | null;
  siteLongitude: number | null;
  geofenceRadiusMeters: number;
}

interface ProjectDetailResponse {
  project: Project;
  items: Item[];
  categories: ProjectCategory[];
  orders: OrderLite[];
  /** When false, PM must not create another order on this project (API-enforced). */
  eligibleForNewOrder?: boolean;
}

/**
 * Project detail: rename / delete the project, manage its items, and
 * see the orders scoped to it. PMs get the full surface; installers
 * see a read-only summary.
 */
function ProjectApprovalBanners({
  project,
  viewerRole,
}: {
  project: Project;
  viewerRole: Role;
}) {
  const patch =
    project.pendingPatch && typeof project.pendingPatch === "object"
      ? (project.pendingPatch as Record<string, unknown>)
      : null;
  const patchKeys = patch ? Object.keys(patch) : [];
  const hasQueuedPatch = patchKeys.length > 0;

  const statusCopy: Partial<
    Record<ProjectApprovalStatus, { title: string; body: string }>
  > = {
    pending_super_admin: {
      title: "Waiting for super-admin approval",
      body: "Installers cannot see this project until a super-admin approves it and logistics activates it.",
    },
    pending_logistics: {
      title: "Waiting for logistics",
      body: "Super-admin approved this project. Logistics must confirm stock and activate it before installers can use it.",
    },
    rejected_super_admin: {
      title: "Rejected by super-admin",
      body: "This project was not approved. Contact your supervisor if this is unexpected.",
    },
    rejected_logistics: {
      title: "Rejected by logistics",
      body: "Logistics could not fulfill this project as requested.",
    },
  };

  const blocks: ReactNode[] = [];

  if (
    project.approvalStatus !== "active" &&
    statusCopy[project.approvalStatus]
  ) {
    const m = statusCopy[project.approvalStatus]!;
    blocks.push(
      <div
        key="status"
        className="card border-amber-200 bg-amber-50/90 p-4 dark:border-amber-900/60 dark:bg-amber-950/40"
      >
        <div className="text-sm font-semibold text-amber-950 dark:text-amber-100">
          {m.title}
        </div>
        <p className="mt-1 text-xs text-[color:var(--text)]">{m.body}</p>
        {viewerRole === "logistics" &&
          project.approvalStatus === "pending_logistics" &&
          project.projectBarcode && (
            <p className="mt-2 font-mono text-sm text-[color:var(--text)]">
              <span className="font-sans text-xs font-semibold text-[color:var(--text-muted)]">
                Project barcode:{" "}
              </span>
              {project.projectBarcode}
            </p>
          )}
      </div>,
    );
  }

  if (
    hasQueuedPatch &&
    (viewerRole === "pm" ||
      viewerRole === "super_admin" ||
      viewerRole === "logistics")
  ) {
    const stageHint =
      project.metadataChangeStage === METADATA_PENDING_SUPER_ADMIN
        ? "Waiting on super-admin to forward these changes to logistics."
        : project.metadataChangeStage === METADATA_PENDING_LOGISTICS
          ? "Waiting on logistics to confirm before changes go live."
          : legacyNoStage(project)
            ? "These edits will apply when logistics confirms (legacy pending patch)."
            : null;

    blocks.push(
      <div
        key="patch"
        className="card border-[color:var(--border)] bg-[color:var(--surface-muted)]/80 p-4"
      >
        <div className="text-sm font-semibold">Updates queued</div>
        <p className="mt-1 text-xs text-[color:var(--text-muted)]">
          Edits to name, description, or installer assignment stay staged until the
          approval chain clears:{" "}
          <span className="font-medium text-[color:var(--text)]">
            {patchKeys.join(", ")}
          </span>
          {stageHint ? (
            <>
              {" "}
              <span className="block pt-2 text-[color:var(--text)]">
                {stageHint}
              </span>
            </>
          ) : null}
        </p>
      </div>,
    );
  }

  if (
    project.pendingDeleteRequested &&
    (viewerRole === "pm" ||
      viewerRole === "super_admin" ||
      viewerRole === "logistics")
  ) {
    const delHint =
      project.metadataChangeStage === METADATA_PENDING_SUPER_ADMIN
        ? "Super-admin must forward to logistics."
        : project.metadataChangeStage === METADATA_PENDING_LOGISTICS
          ? "Logistics will remove the project after confirming there are no blocking orders."
          : "Removal is queued.";
    blocks.push(
      <div
        key="delete"
        className="card border-[color:var(--danger)]/50 bg-[color:var(--surface-muted)] p-4"
      >
        <div className="text-sm font-semibold text-[color:var(--danger)]">
          Project deletion requested
        </div>
        <p className="mt-1 text-xs text-[color:var(--text-muted)]">{delHint}</p>
      </div>,
    );
  }

  if (blocks.length === 0) return null;
  return <div className="space-y-3">{blocks}</div>;
}

function legacyNoStage(project: Project) {
  return (
    project.metadataChangeStage == null &&
    project.approvalStatus === "active"
  );
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthedUser();
  const { data, mutate, isLoading } = useSWR<ProjectDetailResponse>(
    params?.id ? `/api/projects/${params.id}` : null,
  );
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [deleteProjectBusy, setDeleteProjectBusy] = useState(false);
  const [deleteProjectError, setDeleteProjectError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (deleteProjectOpen) setDeleteProjectError(null);
  }, [deleteProjectOpen]);

  if (!user) return null;
  const canManage = user.role === "pm" || user.role === "super_admin";

  if (isLoading || !data) {
    return (
      <div className="card p-10 text-center text-sm text-[color:var(--text-muted)]">
        Loading project…
      </div>
    );
  }

  const { project, items, orders, categories } = data;
  const eligibleForNewOrder = data.eligibleForNewOrder !== false;
  const deleteQueuesApproval =
    project.approvalStatus === "active" ||
    project.approvalStatus === "pending_logistics";

  async function confirmDeleteProject() {
    setDeleteProjectBusy(true);
    setDeleteProjectError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "DELETE",
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        queuedForApproval?: boolean;
      };
      if (res.ok) {
        if (json.queuedForApproval) {
          setDeleteProjectOpen(false);
          await mutate();
          return;
        }
        setDeleteProjectOpen(false);
        router.push("/projects");
        return;
      }
      setDeleteProjectError(
        typeof json.error === "string"
          ? json.error
          : "Failed to delete project",
      );
    } finally {
      setDeleteProjectBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <Link
            href="/projects"
            className="text-xs font-semibold text-[color:var(--primary)] hover:underline"
          >
            ← All projects
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{project.name}</h1>
          {project.description && (
            <p className="max-w-2xl text-sm text-[color:var(--text-muted)]">
              {project.description}
            </p>
          )}
          {project.siteAddress && (
            <p className="mt-1 max-w-2xl text-xs text-[color:var(--text-muted)]">
              Site: {project.siteAddress}
            </p>
          )}
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2 self-start">
            {eligibleForNewOrder ? (
              <Link
                href={`/orders/new?projectId=${project.id}`}
                className="btn btn-primary"
              >
                + New order
              </Link>
            ) : (
              <span
                className="btn btn-primary cursor-not-allowed opacity-60"
                title="This project already has verified items or a fulfilled order. Create a new project for another dispatch."
                aria-disabled
              >
                + New order
              </span>
            )}
            <button
              type="button"
              onClick={() => setDeleteProjectOpen(true)}
              className="btn btn-danger"
            >
              Delete project
            </button>
          </div>
        )}
      </div>

      <ProjectApprovalBanners project={project} viewerRole={user.role} />

      {canManage && (
        <>
          <ProjectEditPanel project={project} onChanged={mutate} />
          <InstallerAssignmentPanel
            projectId={project.id}
            installerUserId={project.installerUserId}
            onChanged={mutate}
          />
        </>
      )}

      <ProjectInventorySection
        projectId={project.id}
        items={items}
        categories={categories ?? []}
        canEdit={canManage}
        onChanged={mutate}
      />

      <OrdersSection orders={orders} />

      <ConfirmModal
        open={deleteProjectOpen}
        onOpenChange={(open) => {
          setDeleteProjectOpen(open);
          if (!open) setDeleteProjectError(null);
        }}
        title="Delete this project?"
        description={
          deleteQueuesApproval ? (
            <>
              <span className="font-medium text-[color:var(--text)]">
                {project.name}
              </span>{" "}
              is active or mid-rollout. We will queue this deletion for
              super-admin (and logistics) confirmation instead of removing it
              instantly. Make sure no blocking orders remain first.
            </>
          ) : (
            <>
              <span className="font-medium text-[color:var(--text)]">
                {project.name}
              </span>{" "}
              will be removed permanently. All items in this project are deleted
              with it. If any orders still reference this project, delete or
              reassign them first.
            </>
          )
        }
        confirmLabel="Delete project"
        cancelLabel="Cancel"
        variant="danger"
        busy={deleteProjectBusy}
        error={deleteProjectError}
        onConfirm={confirmDeleteProject}
      />
    </div>
  );
}

function InstallerAssignmentPanel({
  projectId,
  installerUserId,
  onChanged,
}: {
  projectId: string;
  installerUserId: string | null;
  onChanged: () => Promise<unknown>;
}) {
  const qc = useQueryClient();
  const { data } = useSWR<{ users: { id: string; name: string; email: string; role: string }[] }>(
    "/api/users",
  );
  const [value, setValue] = useState(installerUserId ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);

  useEffect(() => {
    setValue(installerUserId ?? "");
  }, [installerUserId]);

  const installers =
    data?.users.filter((u) => u.role === "installer") ?? [];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setQueued(false);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          installerUserId: value === "" ? null : value,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        queuedForApproval?: boolean;
      };
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      if (json.queuedForApproval) setQueued(true);
      await onChanged();
      await qc.invalidateQueries({ queryKey: queryKeys.approvalsQueueCounts });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-6">
      <h2 className="text-base font-semibold">Assigned installer</h2>
      <p className="mt-1 text-xs text-[color:var(--text-muted)]">
        When set, only that installer can verify in the app (scans with the
        printed sticker QR are unchanged).
      </p>
      <form
        onSubmit={save}
        className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <label className="block flex-1">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            Installer
          </span>
          <select
            className="input w-full"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          >
            <option value="">— Anyone with installer login —</option>
            {installers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </form>
      {queued && (
        <p className="mt-2 text-xs text-[color:var(--info)]">
          Change queued for super-admin / logistics approval before it goes live.
        </p>
      )}
      {err && (
        <p className="mt-2 text-xs text-[color:var(--danger)]">{err}</p>
      )}
    </section>
  );
}

function CategoriesManageSection({
  projectId,
  categories,
  canEdit,
  onChanged,
}: {
  projectId: string;
  categories: ProjectCategory[];
  canEdit: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [busy, setBusy] = useState(false);
  const [queuedMsg, setQueuedMsg] = useState<string | null>(null);
  const [delBusy, setDelBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    setError(null);
    try {
      const qty = Math.max(1, Number.parseInt(quantity || "1", 10) || 1);
      const res = await fetch(`/api/projects/${projectId}/categories`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: n, quantity: qty }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        category?: ProjectCategory;
        queuedForApproval?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Could not save category");
      if (json.queuedForApproval) {
        setQueuedMsg(
          `“${n}” (×${qty} units) queued for super-admin approval.`,
        );
      } else {
        setQueuedMsg(null);
      }
      setName("");
      setQuantity("1");
      await onChanged();
      await qc.invalidateQueries({ queryKey: queryKeys.approvalsQueueCounts });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeCategory(id: string, label: string) {
    if (
      !confirm(`Remove category "${label}"? Items must not still use it.`)
    ) {
      return;
    }
    setDelBusy(id);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/categories/${id}`,
        { method: "DELETE" },
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not remove category");
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDelBusy(null);
    }
  }

  return (
    <div className="space-y-6 p-6">
      {canEdit ? (
        <>
          <form onSubmit={addCategory} className="flex flex-wrap gap-3 md:items-end">
            <label className="block min-w-[200px] flex-1">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
                New category name
              </span>
              <input
                className="input w-full"
                placeholder='e.g. Upper unit, Lower unit'
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block w-28">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
                Units
              </span>
              <input
                type="number"
                min={1}
                className="input w-full text-right"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
            <button type="submit" disabled={busy || !name.trim()} className="btn btn-primary">
              {busy ? "Saving…" : "Add category"}
            </button>
          </form>
          {queuedMsg ? (
            <p className="text-xs text-[color:var(--info)]">{queuedMsg}</p>
          ) : null}
        </>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-[color:var(--danger)] px-3 py-2 text-xs text-[color:var(--danger)]">
          {error}
        </div>
      ) : null}

      {categories.length === 0 ? (
        <p className="text-sm text-[color:var(--text-muted)]">
          No categories yet.
          {canEdit ? " Add labels here so the Items tab stays simple." : null}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[color:var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--surface-muted)] text-xs uppercase tracking-wide text-[color:var(--text-muted)]">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="hidden px-4 py-3 text-left sm:table-cell">
                  Created
                </th>
                {canEdit ? (
                  <th className="px-4 py-3 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border)]">
              {categories.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="hidden px-4 py-3 text-[color:var(--text-muted)] sm:table-cell">
                    {new Date(c.createdAt).toLocaleString()}
                  </td>
                  {canEdit ? (
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={delBusy !== null}
                        onClick={() => void removeCategory(c.id, c.name)}
                        className="btn btn-ghost btn-sm text-[color:var(--danger)]"
                      >
                        {delBusy === c.id ? "Removing…" : "Remove"}
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProjectInventorySection({
  projectId,
  items,
  categories,
  canEdit,
  onChanged,
}: {
  projectId: string;
  items: Item[];
  categories: ProjectCategory[];
  canEdit: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const [tab, setTab] = useState<"items" | "categories">("items");

  const tabBtn = (id: "items" | "categories", label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
        tab === id
          ? "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]"
          : "bg-[color:var(--surface-muted)] text-[color:var(--text)] hover:bg-[color:var(--surface)]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <section className="card overflow-hidden">
      <header className="space-y-4 border-b border-[color:var(--border)] px-6 py-4">
        <div className="flex flex-wrap gap-2">
          {tabBtn("items", "Items")}
          {tabBtn("categories", "Categories")}
        </div>
        <div>
          <h2 className="text-base font-semibold">
            {tab === "items" ? "Items" : "Categories"}
          </h2>
          <p className="mt-1 text-xs text-[color:var(--text-muted)]">
            {tab === "items"
              ? "Each physical unit is its own row (unique SKU). Pick a category on the left tab, or use a custom name for one-off parts."
              : "Create reusable labels here. The Items tab only picks from this list so adding stock stays fast in the field."}
          </p>
        </div>
      </header>

      {tab === "categories" ? (
        <CategoriesManageSection
          projectId={projectId}
          categories={categories}
          canEdit={canEdit}
          onChanged={onChanged}
        />
      ) : (
        <>
          {canEdit && (
            <AddItemForm
              projectId={projectId}
              categories={categories}
              onCreated={onChanged}
              existingSkus={items.map((i) => i.sku)}
              onGoToCategories={() => setTab("categories")}
            />
          )}

          {items.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-[color:var(--text-muted)]">
              No items yet.{" "}
              {canEdit && "Use the form above to add your first units."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[color:var(--surface-muted)] text-xs uppercase tracking-wide text-[color:var(--text-muted)]">
                  <tr>
                    <th className="px-6 py-3 text-left">Category</th>
                    <th className="px-6 py-3 text-left">Batch</th>
                    <th className="px-6 py-3 text-left">SKU</th>
                    <th className="px-6 py-3 text-left">Name</th>
                    <th className="px-6 py-3 text-right">Stock</th>
                    {canEdit && (
                      <th className="px-6 py-3 text-right">
                        <span className="sr-only">Actions</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--border)]">
                  {items.map((i) => (
                    <ItemRow
                      key={i.id}
                      item={i}
                      projectId={projectId}
                      canEdit={canEdit}
                      onChanged={onChanged}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function shortBatchId(batchId: string | null | undefined): string {
  if (!batchId) return "—";
  return batchId.replace(/-/g, "").slice(0, 8);
}

function AddItemForm({
  projectId,
  categories: initialCategories,
  onCreated,
  existingSkus,
  onGoToCategories,
}: {
  projectId: string;
  categories: ProjectCategory[];
  onCreated: () => Promise<unknown>;
  existingSkus: string[];
  onGoToCategories?: () => void;
}) {
  const [categories, setCategories] = useState(initialCategories);
  const [mode, setMode] = useState<"category" | "custom">("category");
  const [categoryId, setCategoryId] = useState("");
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skuDirty, setSkuDirty] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewLines, setPreviewLines] = useState<string[]>([]);
  const [pendingPayload, setPendingPayload] = useState<Record<
    string,
    unknown
  > | null>(null);

  useEffect(() => {
    setCategories(initialCategories);
  }, [initialCategories]);

  useEffect(() => {
    if (skuDirty || !name.trim() || mode !== "custom") return;
    const base = skuBaseFromLabel(name);
    const idx = nextSkuIndexForBase(base, existingSkus);
    setSku(formatSkuSequence(base, idx));
  }, [name, existingSkus, skuDirty, mode]);

  function buildPayload(): Record<string, unknown> {
    const quantity = Math.min(
      500,
      Math.max(1, Number.parseInt(qty || "1", 10) || 1),
    );
    if (mode === "category") {
      if (!categoryId) throw new Error("Choose a category");
      return { categoryId, quantity };
    }
    return {
      name: name.trim(),
      quantity,
    };
  }

  function buildPreviewLines(quantity: number): string[] {
    if (mode === "category") {
      const cat = categories.find((c) => c.id === categoryId);
      const label = cat?.name ?? "Category";
      return Array.from(
        { length: quantity },
        (_, i) => `${label} (${i + 1} of ${quantity})`,
      );
    }
    const n = name.trim();
    if (quantity <= 1) return [n];
    return Array.from(
      { length: quantity },
      (_, i) => `${n} · ${i + 1} of ${quantity}`,
    );
  }

  function prepareSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const payload = buildPayload();
      const quantity = payload.quantity as number;
      if (mode === "custom" && !name.trim()) {
        setError("Enter a name");
        return;
      }
      if (mode === "category" && !categoryId) {
        setError("Choose a category from the list");
        return;
      }
      if (quantity > 1) {
        setPreviewLines(buildPreviewLines(quantity));
        setPendingPayload(payload);
        setConfirmOpen(true);
        return;
      }
      void executePost(payload);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function executePost(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/items`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to add items");
      setSku("");
      setName("");
      setQty("1");
      setSkuDirty(false);
      setConfirmOpen(false);
      setPendingPayload(null);
      await onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form
        onSubmit={prepareSubmit}
        className="space-y-4 border-b border-[color:var(--border)] p-6"
      >
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="add-mode"
              checked={mode === "category"}
              onChange={() => setMode("category")}
            />
            Category
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="add-mode"
              checked={mode === "custom"}
              onChange={() => setMode("custom")}
            />
            Custom name
          </label>
        </div>

        {mode === "category" ? (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--text-muted)]">
                  Category (name &amp; SKU follow this label)
                </label>
                <select
                  className="input w-full"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--text-muted)]">
                  How many units?
                </label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  className="input w-full text-right md:w-28"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </div>
            </div>
            {categories.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[color:var(--border)] bg-[color:var(--surface-muted)]/50 p-4 text-xs text-[color:var(--text-muted)]">
                Create at least one category first.{" "}
                {onGoToCategories ? (
                  <button
                    type="button"
                    className="mt-2 inline font-semibold text-[color:var(--primary)] hover:underline"
                    onClick={onGoToCategories}
                  >
                    Open Categories tab
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-[color:var(--text-muted)]">
                Labels are edited only under Categories. Need another template?{" "}
                {onGoToCategories ? (
                  <button
                    type="button"
                    className="font-semibold text-[color:var(--primary)] hover:underline"
                    onClick={onGoToCategories}
                  >
                    Switch to Categories
                  </button>
                ) : (
                  <>Use the Categories tab.</>
                )}
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-[1fr_2fr_7rem_auto]">
            <input
              className="input font-mono"
              placeholder="SKU (auto from name)"
              value={sku}
              onChange={(e) => {
                setSkuDirty(true);
                setSku(e.target.value);
              }}
            />
            <input
              required={mode === "custom"}
              className="input"
              placeholder="Name — SKU suggests from label"
              value={name}
              onChange={(e) => {
                setSkuDirty(false);
                setName(e.target.value);
              }}
            />
            <input
              type="number"
              min={1}
              max={500}
              className="input text-right"
              placeholder="Units"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
            <span className="hidden md:block" />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={busy} className="btn btn-primary">
            {busy ? "Adding…" : "Add items"}
          </button>
          <span className="text-xs text-[color:var(--text-muted)]">
            {mode === "category"
              ? "One database row per unit — each gets its own QR when orders ship."
              : "Several units: each row is separate; SKUs are generated for you."}
          </span>
        </div>
        {error && (
          <div className="rounded-lg border border-[color:var(--danger)] bg-red-50 px-3 py-2 text-xs text-[color:var(--danger)] dark:bg-red-950/30">
            {error}
          </div>
        )}
      </form>

      <ConfirmModal
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setPendingPayload(null);
        }}
        title="Create these items?"
        variant="default"
        description={
          <div className="space-y-3 text-sm text-[color:var(--text)]">
            <p>
              This action creates{" "}
              <strong>{previewLines.length}</strong> separate items for this
              project. Each has its own ID and stock so they can be scanned
              independently.
            </p>
            <ul className="max-h-48 list-inside list-disc overflow-y-auto rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)]/80 px-3 py-2 text-xs">
              {previewLines.map((line, idx) => (
                <li key={idx}>{line}</li>
              ))}
            </ul>
          </div>
        }
        confirmLabel="Yes, create items"
        cancelLabel="Cancel"
        busy={busy}
        onConfirm={() =>
          pendingPayload ? executePost(pendingPayload) : undefined
        }
      />
    </>
  );
}

function ItemRow({
  item,
  projectId,
  canEdit,
  onChanged,
}: {
  item: Item;
  projectId: string;
  canEdit: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [sku, setSku] = useState(item.sku);
  const [delta, setDelta] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/items/${item.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdits() {
    await patch({ name, sku });
    setEditing(false);
  }

  async function restock(sign: 1 | -1) {
    const amt = Math.abs(Number.parseInt(delta || "1", 10) || 1);
    if (amt < 1) return;
    await patch({ delta: sign * amt });
    setDelta("1");
  }

  async function onDelete() {
    if (!confirm(`Delete item "${item.sku}"? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/items/${item.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Delete failed");
      }
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const negative = item.stockQuantity < 0;

  return (
    <>
      <tr>
        <td className="px-6 py-3 text-[color:var(--text-muted)]">
          {item.categoryName ?? "—"}
        </td>
        <td
          className="px-6 py-3 font-mono text-xs text-[color:var(--text-muted)]"
          title={item.batchId ?? undefined}
        >
          {shortBatchId(item.batchId)}
        </td>
        <td className="px-6 py-3 font-mono">
          {editing ? (
            <input
              className="input font-mono"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
            />
          ) : (
            item.sku
          )}
        </td>
        <td className="px-6 py-3">
          {editing ? (
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          ) : (
            item.name
          )}
        </td>
        <td
          className={`px-6 py-3 text-right font-mono text-base font-semibold ${
            negative
              ? "text-[color:var(--danger)]"
              : item.stockQuantity === 0
                ? "text-[color:var(--warning)]"
                : "text-[color:var(--text)]"
          }`}
        >
          {item.stockQuantity}
        </td>
        {canEdit && (
          <td className="px-6 py-3">
            {editing ? (
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={saveEdits}
                  disabled={busy}
                  className="btn btn-primary text-xs"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setName(item.name);
                    setSku(item.sku);
                  }}
                  disabled={busy}
                  className="btn btn-ghost text-xs"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <input
                  type="number"
                  min={1}
                  value={delta}
                  onChange={(e) => setDelta(e.target.value)}
                  className="input w-20 text-right"
                  title="Units to add or remove (minimum 1 per click)"
                />
                <button
                  onClick={() => restock(1)}
                  disabled={busy}
                  className="btn btn-ghost text-xs"
                >
                  + add
                </button>
                <button
                  onClick={() => restock(-1)}
                  disabled={busy || item.stockQuantity <= 1}
                  title={
                    item.stockQuantity <= 1
                      ? "Stock cannot go below 1"
                      : undefined
                  }
                  className="btn btn-ghost text-xs"
                >
                  − remove
                </button>
                <button
                  onClick={() => setEditing(true)}
                  disabled={busy}
                  className="btn btn-ghost text-xs"
                >
                  Edit
                </button>
                <button
                  onClick={onDelete}
                  disabled={busy}
                  className="btn btn-ghost text-xs text-[color:var(--danger)]"
                >
                  Delete
                </button>
              </div>
            )}
          </td>
        )}
      </tr>
      {error && (
        <tr>
          <td
            colSpan={canEdit ? 6 : 5}
            className="bg-red-50 px-6 py-2 text-xs text-[color:var(--danger)]"
          >
            {error}
          </td>
        </tr>
      )}
    </>
  );
}

function OrdersSection({ orders }: { orders: OrderLite[] }) {
  return (
    <section className="card overflow-hidden">
      <header className="border-b border-[color:var(--border)] px-6 py-4">
        <h2 className="text-base font-semibold">Orders in this project</h2>
        <p className="text-xs text-[color:var(--text-muted)]">
          Every order here can only reference the items above.
        </p>
      </header>
      {orders.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-[color:var(--text-muted)]">
          No orders yet.
        </div>
      ) : (
        <ul className="divide-y divide-[color:var(--border)]">
          {orders.map((o) => (
            <li
              key={o.id}
              className="flex items-center justify-between px-6 py-3"
            >
              <div>
                <StatusPill status={o.status} />
                <span className="ml-3 text-xs text-[color:var(--text-muted)]">
                  {new Date(o.createdAt).toLocaleString()} · {o.createdBy}
                </span>
              </div>
              <Link
                href={`/orders/${o.id}`}
                className="text-xs font-semibold text-[color:var(--primary)] hover:underline"
              >
                Open →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
