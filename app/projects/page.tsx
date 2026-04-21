"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "@/lib/swr";
import { useAuthedUser } from "@/components/session-context";

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
}

interface ProjectsResponse {
  projects: ProjectRow[];
}

interface DraftItem {
  id: string;
  sku: string;
  name: string;
  stockQuantity: string;
}

/**
 * Projects list. Replaces the old single global "Warehouse" page:
 * inventory now lives inside projects, and each project is created
 * with its starting items in one shot.
 */
export default function ProjectsPage() {
  const user = useAuthedUser();
  const { data, mutate, isLoading } =
    useSWR<ProjectsResponse>("/api/projects");
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");

  if (!user) return null;
  const isPm = user.role === "pm";

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
        {isPm && (
          <button
            type="button"
            onClick={() => setShowForm((s) => !s)}
            className="btn btn-primary self-start"
          >
            {showForm ? "Cancel" : "+ New project"}
          </button>
        )}
      </div>

      {showForm && isPm && (
        <NewProjectForm
          onDone={async () => {
            await mutate();
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

      {!isLoading && projects.length === 0 && (
        <div className="card p-10 text-center text-sm text-[color:var(--text-muted)]">
          {isPm
            ? "No projects yet. Create one above to start adding items."
            : "No projects have been shared with you yet. Ask your PM to set one up."}
        </div>
      )}

      {filtered.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectRow }) {
  return (
    <li className="card flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{project.name}</h2>
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

function NewProjectForm({
  onDone,
  onCancel,
}: {
  onDone: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<DraftItem[]>([
    { id: crypto.randomUUID(), sku: "", name: "", stockQuantity: "0" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateItem(id: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), sku: "", name: "", stockQuantity: "0" },
    ]);
  }

  function removeItem(id: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((i) => i.id !== id) : prev));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const partial = items.filter(
        (i) =>
          (i.sku.trim().length > 0 && i.name.trim().length === 0) ||
          (i.sku.trim().length === 0 && i.name.trim().length > 0),
      );
      if (partial.length > 0) {
        setError("Each item row needs both a SKU and a name (or clear unused rows).");
        setBusy(false);
        return;
      }

      const cleanItems = items
        .map((i) => ({
          sku: i.sku.trim(),
          name: i.name.trim(),
          stockQuantity: Math.max(0, parseInt(i.stockQuantity || "0", 10) || 0),
        }))
        .filter((i) => i.sku && i.name);

      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          items: cleanItems,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create project");
      await onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-6">
      <h2 className="text-base font-semibold">New project</h2>
      <p className="text-xs text-[color:var(--text-muted)]">
        Name the project and list the items it will track. You can add or
        remove items later.
      </p>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
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

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
              Items
            </span>
            <button
              type="button"
              onClick={addItem}
              className="btn btn-ghost text-xs"
            >
              + Add another
            </button>
          </div>
          <div className="space-y-2">
            {items.map((i) => (
              <div
                key={i.id}
                className="grid gap-2 md:grid-cols-[1fr_2fr_7rem_auto]"
              >
                <input
                  className="input font-mono"
                  placeholder="SKU"
                  value={i.sku}
                  onChange={(e) => updateItem(i.id, { sku: e.target.value })}
                />
                <input
                  className="input"
                  placeholder="Name (e.g. 2kW Inverter)"
                  value={i.name}
                  onChange={(e) => updateItem(i.id, { name: e.target.value })}
                />
                <input
                  type="number"
                  min={0}
                  className="input text-right"
                  placeholder="Stock"
                  value={i.stockQuantity}
                  onChange={(e) =>
                    updateItem(i.id, { stockQuantity: e.target.value })
                  }
                />
                <button
                  type="button"
                  onClick={() => removeItem(i.id)}
                  disabled={items.length === 1}
                  className="btn btn-ghost text-xs"
                  aria-label="Remove item"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-[color:var(--danger)] bg-red-50 px-3 py-2 text-sm text-[color:var(--danger)]">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="btn btn-ghost"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || name.trim().length === 0}
            className="btn btn-primary"
          >
            {busy ? "Creating…" : "Create project"}
          </button>
        </div>
      </form>
    </section>
  );
}
