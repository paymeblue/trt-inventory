"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

interface BarcodeProps {
  value: string;
  height?: number;
  width?: number;
  displayValue?: boolean;
  margin?: number;
  className?: string;
}

export function Barcode({
  value,
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
        margin,
        fontSize: 12,
        background: "#ffffff",
      });
    } catch (err) {
      console.error("Failed to render barcode", err);
    }
  }, [value, height, width, displayValue, margin]);

  return <svg ref={ref} className={className} aria-label={`Barcode ${value}`} />;
}
