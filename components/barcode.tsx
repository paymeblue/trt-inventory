"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

interface BarcodeProps {
  /**
   * The string actually encoded in the bars. For the printed item
   * stickers this is the full `/s/<barcode>` deep-link URL so a 3rd-
   * party phone scanner that reads CODE128 still gets a tappable link.
   */
  value: string;
  /**
   * Optional override for the human-readable text printed under the
   * bars. Useful when `value` is a long URL but you want the operator
   * to see only the bare barcode. Falls back to `value`.
   */
  text?: string;
  height?: number;
  width?: number;
  displayValue?: boolean;
  margin?: number;
  className?: string;
}

export function Barcode({
  value,
  text,
  height = 60,
  width = 1.8,
  displayValue = true,
  margin = 4,
  className,
}: BarcodeProps) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, {
        format: "CODE128",
        height,
        width,
        displayValue,
        ...(text ? { text } : {}),
        margin,
        fontSize: 12,
        background: "#ffffff",
      });
    } catch (err) {
      console.error("Failed to render barcode", err);
    }
  }, [value, text, height, width, displayValue, margin]);

  return <svg ref={ref} className={className} aria-label={`Barcode ${text ?? value}`} />;
}
