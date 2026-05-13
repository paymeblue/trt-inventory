/**
 * How many physically scannable packing lines to mint for a SKU on an order.
 * Uses project item `stockQuantity`; zero or negative yields no lines.
 */
export function packingLineCountForStock(stockQuantity: unknown): number {
  const n = Math.floor(Number(stockQuantity));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}
