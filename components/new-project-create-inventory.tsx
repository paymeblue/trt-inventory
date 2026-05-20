"use client";

import { useEffect, useMemo, useState } from "react";
import { ConfirmModal } from "@/components/confirm-modal";

export type DraftCategoryDef = {
  localId: string;
  name: string;
};

export type DraftInventoryLine =
  | {
      id: string;
      kind: "category";
      categoryLocalId: string;
      quantity: number;
      label: string;
    }
  | {
      id: string;
      kind: "custom";
      name: string;
      quantity: number;
    };

export type CreateInventoryPayload = {
  categoryDefinitions: { localId: string; name: string }[];
  inventory: (
    | { kind: "category"; categoryLocalId: string; quantity: number }
    | { kind: "custom"; name: string; quantity: number }
  )[];
};

export type NewProjectInventoryDraft = {
  categories: DraftCategoryDef[];
  lines: DraftInventoryLine[];
  payload: CreateInventoryPayload;
  totalUnits: number;
};

type Props = {
  onDraftChange: (draft: NewProjectInventoryDraft) => void;
};

function buildPayload(
  cats: DraftCategoryDef[],
  inv: DraftInventoryLine[],
): CreateInventoryPayload {
  const categoryDefinitions = cats
    .map((c) => ({ localId: c.localId, name: c.name.trim() }))
    .filter((c) => c.name.length > 0);

  return {
    categoryDefinitions,
    inventory: inv.map((l) =>
      l.kind === "category"
        ? {
            kind: "category" as const,
            categoryLocalId: l.categoryLocalId,
            quantity: l.quantity,
          }
        : {
            kind: "custom" as const,
            name: l.name,
            quantity: l.quantity,
          },
    ),
  };
}

/**
 * Sequential categories + items builder for the new-project form (local state).
 */
export function NewProjectCreateInventory({ onDraftChange }: Props) {
  const [categories, setCategories] = useState<DraftCategoryDef[]>([]);
  const [lines, setLines] = useState<DraftInventoryLine[]>([]);

  const [categoryLocalId, setCategoryLocalId] = useState("");
  const [customName, setCustomName] = useState("");
  const [qty, setQty] = useState("1");
  const [itemErr, setItemErr] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewLines, setPreviewLines] = useState<string[]>([]);
  useEffect(() => {
    emit(categories, lines);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed parent draft on mount
  }, []);

  const [pendingAdd, setPendingAdd] = useState<
    | {
        kind: "category";
        categoryLocalId: string;
        quantity: number;
        label: string;
      }
    | {
        kind: "custom";
        name: string;
        quantity: number;
        label: string;
      }
    | null
  >(null);

  const namedCategories = useMemo(
    () => categories.filter((c) => c.name.trim().length > 0),
    [categories],
  );

  const totalUnits = useMemo(
    () => lines.reduce((s, l) => s + l.quantity, 0),
    [lines],
  );

  function emit(cats: DraftCategoryDef[], inv: DraftInventoryLine[]) {
    const payload = buildPayload(cats, inv);
    onDraftChange({
      categories: cats,
      lines: inv,
      payload,
      totalUnits: inv.reduce((s, l) => s + l.quantity, 0),
    });
  }

  function updateCategories(next: DraftCategoryDef[]) {
    setCategories(next);
    const renamed = lines.map((l) => {
      if (l.kind !== "category") return l;
      const cat = next.find((c) => c.localId === l.categoryLocalId);
      return cat ? { ...l, label: cat.name.trim() || l.label } : l;
    });
    setLines(renamed);
    emit(next, renamed);
  }

  function addCategoryRow() {
    updateCategories([
      ...categories,
      { localId: crypto.randomUUID(), name: "" },
    ]);
    setItemErr(null);
  }

  function updateCategoryName(localId: string, name: string) {
    updateCategories(
      categories.map((c) => (c.localId === localId ? { ...c, name } : c)),
    );
  }

  function removeCategoryRow(localId: string) {
    const nextCats = categories.filter((c) => c.localId !== localId);
    const nextLines = lines.filter(
      (l) => l.kind !== "category" || l.categoryLocalId !== localId,
    );
    setCategories(nextCats);
    setLines(nextLines);
    if (categoryLocalId === localId) setCategoryLocalId("");
    emit(nextCats, nextLines);
  }

  function queueAddItem() {
    setItemErr(null);
    const quantity = Math.min(
      500,
      Math.max(1, Number.parseInt(qty || "1", 10) || 1),
    );

    if (categoryLocalId) {
      const cat = namedCategories.find((c) => c.localId === categoryLocalId);
      if (!cat) {
        setItemErr("Choose a category from the list above.");
        return;
      }
      const label = cat.name.trim();
      const previews = Array.from(
        { length: quantity },
        (_, i) => `${label} (unit ${i + 1} of ${quantity})`,
      );
      if (quantity > 1) {
        setPreviewLines(previews);
        setPendingAdd({
          kind: "category",
          categoryLocalId,
          quantity,
          label,
        });
        setConfirmOpen(true);
        return;
      }
      commitAdd({
        kind: "category",
        categoryLocalId,
        quantity,
        label,
      });
      return;
    }

    const n = customName.trim();
    if (!n) {
      setItemErr("Choose a category or enter a custom item name.");
      return;
    }
    const previews =
      quantity <= 1
        ? [n]
        : Array.from(
            { length: quantity },
            (_, i) => `${n} · ${i + 1} of ${quantity}`,
          );
    if (quantity > 1) {
      setPreviewLines(previews);
      setPendingAdd({ kind: "custom", name: n, quantity, label: n });
      setConfirmOpen(true);
      return;
    }
    commitAdd({ kind: "custom", name: n, quantity, label: n });
  }

  function commitAdd(
    add:
      | {
          kind: "category";
          categoryLocalId: string;
          quantity: number;
          label: string;
        }
      | {
          kind: "custom";
          name: string;
          quantity: number;
          label: string;
        },
  ) {
    const row: DraftInventoryLine =
      add.kind === "category"
        ? {
            id: crypto.randomUUID(),
            kind: "category",
            categoryLocalId: add.categoryLocalId,
            quantity: add.quantity,
            label: add.label,
          }
        : {
            id: crypto.randomUUID(),
            kind: "custom",
            name: add.name,
            quantity: add.quantity,
          };
    const next = [...lines, row];
    setLines(next);
    emit(categories, next);
    setQty("1");
    setCustomName("");
    setCategoryLocalId("");
    setConfirmOpen(false);
    setPendingAdd(null);
    setPreviewLines([]);
  }

  function removeLine(id: string) {
    const next = lines.filter((l) => l.id !== id);
    setLines(next);
    emit(categories, next);
  }

  function blockEnterSubmit(e: React.KeyboardEvent) {
    if (e.key === "Enter") e.preventDefault();
  }

  return (
    <div className="space-y-8" onKeyDown={blockEnterSubmit}>
      {/* Categories */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Categories</h3>
          <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">
            Optional labels for grouping items. They appear in the item
            dropdown as you type.
          </p>
        </div>

        {categories.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[color:var(--border)] bg-[color:var(--surface-muted)]/40 px-4 py-3 text-xs text-[color:var(--text-muted)]">
            No categories yet. Add one below, or skip and use custom item
            names only.
          </p>
        ) : (
          <ul className="space-y-2">
            {categories.map((c) => (
              <li
                key={c.localId}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)]/30 px-3 py-2"
              >
                <input
                  className="input min-w-[12rem] flex-1"
                  placeholder="e.g. Upper unit"
                  value={c.name}
                  onChange={(e) =>
                    updateCategoryName(c.localId, e.target.value)
                  }
                />
                <button
                  type="button"
                  className="btn btn-ghost text-xs"
                  onClick={() => removeCategoryRow(c.localId)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          className="btn btn-ghost text-sm"
          onClick={addCategoryRow}
        >
          + Add category
        </button>
      </section>

      {/* Add item */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Add items</h3>
          <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">
            Pick a category or leave it on custom and type a one-off name. Each
            unit becomes its own SKU when the project is approved.
          </p>
        </div>

        <div className="space-y-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)]/20 p-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
              Category
            </span>
            <select
              className="input w-full"
              value={categoryLocalId}
              onChange={(e) => {
                setCategoryLocalId(e.target.value);
                if (e.target.value) setCustomName("");
              }}
            >
              <option value="">Custom name (one-off)</option>
              {namedCategories.map((c) => (
                <option key={c.localId} value={c.localId}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
              Item name
            </span>
            <input
              className="input w-full"
              placeholder={
                categoryLocalId
                  ? "Uses the category label"
                  : "e.g. Spare bracket kit"
              }
              value={customName}
              disabled={Boolean(categoryLocalId)}
              onChange={(e) => setCustomName(e.target.value)}
            />
          </label>

          <label className="block max-w-[8rem]">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
              Units
            </span>
            <input
              type="number"
              min={1}
              max={500}
              className="input w-full text-right"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </label>

          {itemErr ? (
            <p className="text-xs text-[color:var(--danger)]">{itemErr}</p>
          ) : null}

          <button
            type="button"
            className="btn btn-primary w-full sm:w-auto"
            onClick={queueAddItem}
          >
            Add item
          </button>
        </div>
      </section>

      {/* Queue */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">Queued for this project</h3>
          <span className="text-xs font-semibold text-[color:var(--text-muted)]">
            {lines.length === 0
              ? "0 lines · 0 units"
              : `${lines.length} line${lines.length === 1 ? "" : "s"} · ${totalUnits} unit${totalUnits === 1 ? "" : "s"}`}
          </span>
        </div>

        <div className="overflow-hidden rounded-lg border border-[color:var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--surface-muted)] text-xs uppercase tracking-wide text-[color:var(--text-muted)]">
              <tr>
                <th className="px-4 py-2.5 text-left">Label</th>
                <th className="px-4 py-2.5 text-left">Type</th>
                <th className="px-4 py-2.5 text-right">Units</th>
                <th className="px-4 py-2.5 text-right">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border)]">
              {lines.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-xs text-[color:var(--text-muted)]"
                  >
                    Items you add will appear here. Review everything on the
                    next step before submitting.
                  </td>
                </tr>
              ) : (
                lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2.5">
                      <span className="font-medium">
                        {l.kind === "category" ? l.label : l.name}
                      </span>
                      {l.kind === "category" ? (
                        <span className="ml-2 inline-block rounded-md bg-[color:var(--primary)]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--primary)]">
                          Category
                        </span>
                      ) : (
                        <span className="ml-2 inline-block rounded-md bg-[color:var(--surface-muted)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
                          Custom
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 capitalize text-[color:var(--text-muted)]">
                      {l.kind}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      {l.quantity}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        className="btn btn-ghost text-xs"
                        onClick={() => removeLine(l.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmModal
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setPendingAdd(null);
        }}
        title="Add these items?"
        variant="default"
        description={
          <div className="space-y-2 text-sm">
            <p>
              This will queue <strong>{previewLines.length}</strong> separate
              physical units.
            </p>
            <ul className="max-h-40 list-inside list-disc overflow-y-auto text-xs">
              {previewLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        }
        confirmLabel="Yes, add"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (pendingAdd) commitAdd(pendingAdd);
        }}
      />
    </div>
  );
}
