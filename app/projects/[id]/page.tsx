"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "@/lib/swr";
import { ConfirmModal } from "@/components/confirm-modal";
import { StatusPill } from "@/components/status-pill";
import { useAuthedUser } from "@/components/session-context";
import type { OrderStatus } from "@/db/schema";

interface Item {
  id: string;
  projectId: string;
  sku: string;
  name: string;
  stockQuantity: number;
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
}

interface ProjectDetailResponse {
  project: Project;
  items: Item[];
  orders: OrderLite[];
}

/**
 * Project detail: rename / delete the project, manage its items, and
 * see the orders scoped to it. PMs get the full surface; installers
 * see a read-only summary.
 */
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
  const isPm = user.role === "pm";

  if (isLoading || !data) {
    return (
      <div className="card p-10 text-center text-sm text-[color:var(--text-muted)]">
        Loading project…
      </div>
    );
  }

  const { project, items, orders } = data;

  async function confirmDeleteProject() {
    setDeleteProjectBusy(true);
    setDeleteProjectError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setDeleteProjectOpen(false);
        router.push("/projects");
        return;
      }
      const json = (await res.json().catch(() => ({}))) as { error?: string };
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
        </div>
        {isPm && (
          <div className="flex flex-wrap gap-2 self-start">
            <Link
              href={`/orders/new?projectId=${project.id}`}
              className="btn btn-primary"
            >
              + New order
            </Link>
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

      <ItemsSection
        projectId={project.id}
        items={items}
        canEdit={isPm}
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
          <>
            <span className="font-medium text-[color:var(--text)]">
              {project.name}
            </span>{" "}
            will be removed permanently. All items in this project are deleted
            with it. If any orders still reference this project, delete or
            reassign them first.
          </>
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

function ItemsSection({
  projectId,
  items,
  canEdit,
  onChanged,
}: {
  projectId: string;
  items: Item[];
  canEdit: boolean;
  onChanged: () => Promise<unknown>;
}) {
  return (
    <section className="card overflow-hidden">
      <header className="flex items-center justify-between border-b border-[color:var(--border)] px-6 py-4">
        <div>
          <h2 className="text-base font-semibold">Items</h2>
          <p className="text-xs text-[color:var(--text-muted)]">
            Unique to this project. Starting stock is at least 1; PM adjustments
            cannot go below 1 (delivery scans can still reduce on-hand stock).
          </p>
        </div>
      </header>

      {canEdit && <AddItemForm projectId={projectId} onCreated={onChanged} />}

      {items.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-[color:var(--text-muted)]">
          No items yet.{" "}
          {canEdit && "Use the form above to add the project's first SKU."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--surface-muted)] text-xs uppercase tracking-wide text-[color:var(--text-muted)]">
              <tr>
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
    </section>
  );
}

function AddItemForm({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated: () => Promise<unknown>;
}) {
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [stock, setStock] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/items`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sku: sku.trim(),
          name: name.trim(),
          stockQuantity: Math.max(
            1,
            Number.parseInt(stock || "1", 10) || 1,
          ),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to add item");
      setSku("");
      setName("");
      setStock("1");
      await onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-3 border-b border-[color:var(--border)] p-6 md:grid-cols-[1fr_2fr_7rem_auto]"
    >
      <input
        required
        className="input font-mono"
        placeholder="SKU"
        value={sku}
        onChange={(e) => setSku(e.target.value)}
      />
      <input
        required
        className="input"
        placeholder="Name (e.g. 2kW Inverter)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        type="number"
        min={1}
        className="input text-right"
        placeholder="Stock"
        value={stock}
        onChange={(e) => setStock(e.target.value)}
      />
      <button type="submit" disabled={busy} className="btn btn-primary">
        {busy ? "Adding…" : "Add item"}
      </button>
      {error && (
        <div className="rounded-lg border border-[color:var(--danger)] bg-red-50 px-3 py-2 text-xs text-[color:var(--danger)] md:col-span-4">
          {error}
        </div>
      )}
    </form>
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
            colSpan={canEdit ? 4 : 3}
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
