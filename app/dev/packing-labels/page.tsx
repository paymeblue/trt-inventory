"use client";

import { useState } from "react";
import { notFound } from "next/navigation";
import { PackingLabel, PackingLabelPrintSheet } from "@/components/packing-label";
import { PACKING_LABEL } from "@/lib/packing-label-spec";
import { printPackingLabels } from "@/lib/print-packing-labels";

const SAMPLES = [
  {
    barcode: "TRT-ABCDEFGHIJ01",
    productId: "er-fr-001",
    productName: "Emergency first aid kit",
  },
  {
    barcode: "TRT-ABCDEFGHIJ02",
    productId: "cru-xx-002",
    productName: "Ceiling unit replacement long name wrap test",
  },
  {
    barcode: "TRT-ABCDEFGHIJ03",
    productId: "fd-fd-001",
    productName: "Fire door",
  },
] as const;

/**
 * Local label lab — true-size preview + print test without an order.
 * Dev only: http://localhost:3000/dev/packing-labels
 */
export default function PackingLabelDevPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const [zoom, setZoom] = useState<1 | 2 | 3>(3);

  return (
    <>
      <div className="no-print mx-auto max-w-2xl space-y-8 p-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">Packing label preview</h1>
          <p className="text-sm text-[color:var(--text-muted)]">
            {PACKING_LABEL.printerModel} · {PACKING_LABEL.widthIn}×
            {PACKING_LABEL.heightIn} in ({PACKING_LABEL.widthMm}×
            {PACKING_LABEL.heightMm} mm). Dashed box = exact print size.
          </p>
        </header>

        <section className="card space-y-4 p-6">
          <h2 className="text-sm font-semibold">On-screen preview</h2>
          <div className="flex flex-wrap gap-2">
            {([1, 2, 3] as const).map((z) => (
              <button
                key={z}
                type="button"
                className={`btn btn-sm ${zoom === z ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setZoom(z)}
              >
                {z === 1 ? "100%" : `${z}× zoom`}
              </button>
            ))}
          </div>
          <div
            className={`packing-label-preview-stage inline-block rounded-lg bg-[color:var(--surface-muted)] p-6 ${
              zoom === 2
                ? "packing-label-preview-stage--zoom-2"
                : zoom === 3
                  ? "packing-label-preview-stage--zoom-3"
                  : ""
            }`}
          >
            {SAMPLES.map((item) => (
              <PackingLabel key={item.barcode} {...item} />
            ))}
          </div>
          <p className="text-xs text-[color:var(--text-muted)]">
            Scan a QR with your phone — it should open{" "}
            <code className="text-[10px]">/s/…</code> on this dev host.
          </p>
        </section>

        <section className="card space-y-3 p-6">
          <h2 className="text-sm font-semibold">Print test</h2>
          <p className="text-xs text-[color:var(--text-muted)]">
            {PACKING_LABEL.printHint}
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => printPackingLabels()}
          >
            Print sample labels
          </button>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-[color:var(--text-muted)]">
            <li>Use Chrome or Edge print preview first.</li>
            <li>In More settings, turn off Headers and footers.</li>
            <li>Paper: 38 × 25 mm (1.5 × 1 in), margins none, scale 100%.</li>
            <li>Compare peel-off label to the dashed preview above.</li>
          </ol>
        </section>

        <section className="card space-y-2 p-6 text-xs text-[color:var(--text-muted)]">
          <h2 className="text-sm font-semibold text-[color:var(--text)]">
            Storybook?
          </h2>
          <p>
            This repo does not use Storybook yet. This page is the lightweight
            stand-in: same component and CSS as production print. To add
            Storybook later, story <code>PackingLabel</code> and import{" "}
            <code>app/globals.css</code> in preview.
          </p>
        </section>
      </div>

      <PackingLabelPrintSheet items={[...SAMPLES]} />
    </>
  );
}
