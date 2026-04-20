/**
 * Pure helper for constructing the public deep-link URL encoded on each
 * item's QR sticker. Lives in `lib/` (not the order page) so it can be
 * unit-tested and reused wherever we need to render or serialise the URL
 * (e.g. print sheets, email notifications).
 *
 * Origin resolution order:
 *   1. `envOrigin` — typically `NEXT_PUBLIC_APP_URL`. Required when the
 *      PM prints from a laptop on localhost but the installer's phone
 *      needs a publicly-resolvable URL. Trailing slash is stripped.
 *   2. `windowOrigin` — `window.location.origin` on the client. Fine in
 *      prod where the current origin already matches what the phone will
 *      use.
 *   3. Empty string → relative path, which still works if the scan
 *      happens on the same origin the QR was printed from.
 */
export function buildScanUrl(
  barcode: string,
  opts?: { envOrigin?: string | null; windowOrigin?: string | null },
): string {
  const env = (opts?.envOrigin ?? "").trim().replace(/\/+$/, "");
  const win = (opts?.windowOrigin ?? "").trim().replace(/\/+$/, "");
  const origin = env || win || "";
  return `${origin}/s/${encodeURIComponent(barcode)}`;
}
