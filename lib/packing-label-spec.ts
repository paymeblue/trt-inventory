/**
 * Physical packing sticker size for Xprinter XP-365B (and similar 38 mm rolls).
 * Browser print → select this paper size, margins none, scale 100%.
 */
export const PACKING_LABEL = {
  printerModel: "Xprinter XP-365B",
  /** Label width (landscape feed on roll). */
  widthIn: 1.5,
  heightIn: 1,
  widthMm: 38.1,
  heightMm: 25.4,
  /** QR canvas pixels — scaled to ~0.78in in print CSS for sharp output. */
  qrCanvasPx: 84,
  /** Layout tokens — keep in sync with `.packing-label` rules in app/globals.css */
  css: {
    width: "1.5in",
    height: "1in",
    qrSize: "0.78in",
    padding: "0.015in 0.02in 0.01in",
    gap: "0.008in",
  },
  /** Human-readable setup hint for operators. */
  printHint:
    "Paper 38×25 mm (1.5×1 in), margins none, scale 100%, turn OFF headers/footers, Xprinter XP-365B",
} as const;

export type PackingLabelItem = {
  barcode: string;
  productId: string;
  productName?: string | null;
  printedScanToken?: string;
};
