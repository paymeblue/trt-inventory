/**
 * Generates a unique, scannable barcode value for an order item.
 *
 * Format: TRT-<12 upper alphanumeric chars>
 *
 * The value is kept short enough to encode reliably as CODE128 and long
 * enough (36^12 ≈ 4.7e18) to keep collisions practically impossible.
 */
export function generateBarcode(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < 12; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `TRT-${out}`;
}

export function isValidBarcodeShape(value: string): boolean {
  return /^TRT-[A-Z0-9]{12}$/.test(value);
}
