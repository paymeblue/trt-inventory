"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/fetch-json";
import { queryKeys } from "@/lib/query-keys";
import { useAuthedUser } from "@/components/session-context";
import { PageLoading } from "@/components/page-loading";
import { PackingLabelPrintSheet } from "@/components/packing-label";
import { PackingLabelPreview } from "@/components/packing-label-preview";
import { mapOrderItemsToPackingLabels } from "@/lib/packing-label-items";
import { printPackingLabels } from "@/lib/print-packing-labels";
import type { Order, OrderItem, Project } from "@/db/schema";

type OrderItemOut = OrderItem & {
  printedScanToken?: string;
  productName?: string | null;
};

interface GatePayload {
  order: Order;
  project: Project;
  items: OrderItemOut[];
  progress: {
    total: number;
    scanned: number;
    remaining: number;
    percent: number;
  };
}

export default function PrintBarcodesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const user = useAuthedUser();
  const qc = useQueryClient();

  // Per-label selection. Defaults to "everything not yet printed"; user
  // toggles are kept as overrides so the default can shift after a print
  // without fighting the user's explicit choices.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const query = useQuery({
    queryKey: queryKeys.logisticsGate(projectId),
    queryFn: () =>
      fetchJson<GatePayload>(`/api/projects/${projectId}/logistics-gate`),
    enabled: user?.role === "pm" || user?.role === "super_admin",
  });

  const markPrinted = useMutation({
    mutationFn: (itemIds: string[]) =>
      fetchJson<{ printed: number }>(
        `/api/projects/${projectId}/logistics-gate/printed`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ itemIds }),
        },
      ),
    onSuccess: async () => {
      setOverrides({});
      await qc.invalidateQueries({
        queryKey: queryKeys.logisticsGate(projectId),
      });
    },
  });

  if (!user) return null;

  if (user.role !== "pm" && user.role !== "super_admin") {
    return (
      <div className="card p-6">
        <p className="text-sm text-[color:var(--text-muted)]">
          This page is for project managers only.
        </p>
      </div>
    );
  }

  if (query.isPending) return <PageLoading message="Loading packing labels…" />;

  if (query.isError || !query.data) {
    return (
      <div className="card p-6 text-sm text-[color:var(--danger)]">
        {query.error instanceof Error
          ? query.error.message
          : "Could not load packing labels."}
      </div>
    );
  }

  const data = query.data;
  const items = data.items;

  const isSelected = (it: OrderItemOut) =>
    overrides[it.id] ?? it.labelPrintedAt == null;
  const selectedItems = items.filter(isSelected);
  const printedCount = items.filter((it) => it.labelPrintedAt != null).length;
  const remainingCount = items.length - printedCount;

  function toggle(it: OrderItemOut) {
    setOverrides((prev) => ({ ...prev, [it.id]: !isSelected(it) }));
  }

  function setAll(selected: boolean) {
    setOverrides(
      Object.fromEntries(items.map((it) => [it.id, selected])),
    );
  }

  function printSelected() {
    const ids = selectedItems.map((it) => it.id);
    if (ids.length === 0) return;
    // The print dialog blocks the page; once it closes, record the labels
    // as printed so the remaining count decrements.
    window.addEventListener(
      "afterprint",
      () => markPrinted.mutate(ids),
      { once: true },
    );
    printPackingLabels();
  }

  return (
    <>
      <div className="no-print space-y-6">
        <nav className="text-xs text-[color:var(--text-muted)]">
          <Link href="/projects" className="hover:underline">
            ← Projects
          </Link>
          {" · "}
          <Link
            href={`/projects/${projectId}`}
            className="hover:underline"
          >
            {data.project.name}
          </Link>
        </nav>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">
              Print barcodes — {data.project.name}
            </h1>
            <p className="mt-1 text-sm text-[color:var(--text-muted)]">
              Tick the labels you want, print them, and attach one sticker to
              each physical box. Hand the boxes to logistics — they must scan
              each sticker from the physical box to activate the project.
            </p>
          </div>
          {items.length > 0 && (
            <button
              type="button"
              className="btn btn-primary shrink-0"
              disabled={selectedItems.length === 0 || markPrinted.isPending}
              onClick={printSelected}
            >
              {markPrinted.isPending
                ? "Saving…"
                : `Print selected (${selectedItems.length})`}
            </button>
          )}
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-amber-50 px-4 py-3 text-xs text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          <strong>Important:</strong> After printing, do not scan these labels
          yourself. Give the physical boxes (with stickers attached) to the
          logistics team. They will scan each sticker from the box to confirm
          warehouse receipt.
        </div>

        {markPrinted.isError && (
          <div className="rounded-lg border border-[color:var(--danger)] px-4 py-3 text-sm text-[color:var(--danger)]">
            {markPrinted.error instanceof Error
              ? markPrinted.error.message
              : "Could not record the printed labels."}
          </div>
        )}

        {items.length === 0 ? (
          <div className="card p-6 text-center text-sm text-[color:var(--text-muted)]">
            No items found for this project. Add items before printing.
          </div>
        ) : (
          <section className="card overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border)] px-5 py-3">
              <span className="text-sm font-semibold">
                {remainingCount === 0
                  ? `All ${items.length} labels printed`
                  : `${remainingCount} of ${items.length} labels left to print`}
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setAll(true)}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setAll(false)}
                >
                  Clear
                </button>
              </span>
            </header>
            <ul className="divide-y divide-[color:var(--border)]">
              {items.map((it) => {
                const selected = isSelected(it);
                return (
                  <li
                    key={it.id}
                    className={`flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start ${
                      selected ? "" : "opacity-60"
                    }`}
                  >
                    <label className="flex shrink-0 cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-5 w-5 accent-[color:var(--primary)]"
                        checked={selected}
                        onChange={() => toggle(it)}
                        aria-label={`Print label for ${it.productId}`}
                      />
                      <span className="no-print">
                        <PackingLabelPreview
                          item={{
                            barcode: it.barcode,
                            productId: it.productId,
                            productName: it.productName,
                            printedScanToken: it.printedScanToken,
                          }}
                          zoom={2}
                        />
                      </span>
                    </label>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold">
                          {it.productId}
                        </span>
                        {it.labelPrintedAt != null && (
                          <span className="pill pill-fulfilled text-[10px]">
                            Printed{" "}
                            {new Date(it.labelPrintedAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                      {it.productName && (
                        <div className="text-xs text-[color:var(--text-muted)]">
                          {it.productName}
                        </div>
                      )}
                      <div className="truncate font-mono text-xs text-[color:var(--text-muted)]">
                        {it.barcode}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      <PackingLabelPrintSheet
        items={mapOrderItemsToPackingLabels(selectedItems)}
      />
    </>
  );
}
