"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

interface QrCodeProps {
  /** Full value to encode (typically an https URL). */
  value: string;
  size?: number;
  margin?: number;
  className?: string;
}

/**
 * Minimal QR code renderer using `qrcode`.
 *
 * Pairs with the CODE128 <Barcode /> component: PMs print both so that
 * either a phone camera (QR → URL → auto-complete scan) or a handheld
 * USB scanner (CODE128 → types bare barcode into the manual input) works.
 */
export function QrCode({ value, size = 128, margin = 1, className }: QrCodeProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    QRCode.toCanvas(ref.current, value, {
      width: size,
      margin,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    }).catch((err) => {
      console.error("Failed to render QR code", err);
    });
  }, [value, size, margin]);

  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      className={className}
      aria-label={`QR code for ${value}`}
    />
  );
}
