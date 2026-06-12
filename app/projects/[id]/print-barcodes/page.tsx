"use client";

import Link from "next/link";
import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/fetch-json";
import { queryKeys } from "@/lib/query-keys";
import { useAuthedUser } from "@/components/session-context";
import { PageLoading } from "@/components/page-loading";
import { PackingLabelPrintSheet } from "@/components/packing-label";
import { PackingLabelPreview } from "@/components/packing-label-preview";
import { PrintPackingLabelsButton } from "@/components/print-packing-labels-button";
import { mapOrderItemsToPackingLabels } from "@/lib/packing-label-items";
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

  const query = useQuery({
    queryKey: queryKeys.logisticsGate(projectId),
    queryFn: () =>
      fetchJson<GatePayload>(`/api/projects/${projectId}/logistics-gate`),
    enabled: user?.role === "pm" || user?.role === "super_admin",
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
              Print these stickers and attach one to each physical box. Hand the
              boxes to logistics — they must scan each sticker from the physical
              box to activate the project.
            </p>
          </div>
          {data.items.length > 0 && (
            <PrintPackingLabelsButton className="btn btn-primary shrink-0" />
          )}
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-amber-50 px-4 py-3 text-xs text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          <strong>Important:</strong> After printing, do not scan these labels
          yourself. Give the physical boxes (with stickers attached) to the
          logistics team. They will scan each sticker from the box to confirm
          warehouse receipt.
        </div>

        {data.items.length === 0 ? (
          <div className="card p-6 text-center text-sm text-[color:var(--text-muted)]">
            No items found for this project. Add items before printing.
          </div>
        ) : (
          <section className="card overflow-hidden">
            <header className="flex items-center justify-between border-b border-[color:var(--border)] px-5 py-3">
              <span className="text-sm font-semibold">
                Packing labels ({data.items.length})
              </span>
              <PrintPackingLabelsButton className="btn btn-ghost btn-sm" />
            </header>
            <ul className="divide-y divide-[color:var(--border)]">
              {data.items.map((it) => (
                <li
                  key={it.id}
                  className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start"
                >
                  <div className="no-print shrink-0">
                    <PackingLabelPreview
                      item={{
                        barcode: it.barcode,
                        productId: it.productId,
                        productName: it.productName,
                        printedScanToken: it.printedScanToken,
                      }}
                      zoom={2}
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="font-mono text-sm font-semibold">
                      {it.productId}
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
              ))}
            </ul>
          </section>
        )}
      </div>

      <PackingLabelPrintSheet
        items={mapOrderItemsToPackingLabels(data.items)}
      />
    </>
  );
}
