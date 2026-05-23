"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { QrCode } from "@/components/qr-code";
import { PACKING_LABEL } from "@/lib/packing-label-spec";
import { buildScanUrl } from "@/lib/scan-url";

export function PackingLabel({
  barcode,
  productId,
  productName,
  printedScanToken,
}: {
  barcode: string;
  productId: string;
  productName?: string | null;
  printedScanToken?: string;
}) {
  const scanUrl = buildScanUrl(barcode, {
    envOrigin: process.env.NEXT_PUBLIC_APP_URL,
    windowOrigin:
      typeof window !== "undefined" ? window.location.origin : null,
    scanToken: printedScanToken,
  });

  return (
    <div className="packing-label">
      <div className="packing-label__qr">
        <QrCode
          value={scanUrl}
          size={PACKING_LABEL.qrCanvasPx}
          margin={0}
          className="packing-label__qr-canvas"
        />
      </div>
      <div className="packing-label__caption">
        <div className="packing-label__sku">{productId}</div>
        {productName ? (
          <div className="packing-label__name">{productName}</div>
        ) : null}
      </div>
    </div>
  );
}

export function PackingLabelPrintSheet({
  items,
}: {
  items: {
    barcode: string;
    productId: string;
    productName?: string | null;
    printedScanToken?: string;
  }[];
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (items.length === 0 || !mounted) return null;

  return createPortal(
    <div className="packing-label-print-root" aria-hidden>
      {items.map((item) => (
        <PackingLabel
          key={item.barcode}
          barcode={item.barcode}
          productId={item.productId}
          productName={item.productName}
          printedScanToken={item.printedScanToken}
        />
      ))}
    </div>,
    document.body,
  );
}
