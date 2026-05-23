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
