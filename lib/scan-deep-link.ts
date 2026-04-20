/**
 * Classifies a scanned payload. Returns the in-app path to navigate to if
 * the payload is a `/s/<barcode>` deep-link (printed as a QR code on each
 * item), or `null` for anything else (plain CODE128 barcode, unrelated
 * URL, empty string).
 *
 * Lives in `lib/` rather than the React component so it can be imported
 * by tests without pulling in Next.js client code.
 */
export function extractScanDeepLink(payload: string): string | null {
  const trimmed = payload.trim();
  if (!trimmed) return null;

  try {
    const u = new URL(trimmed);
    if (u.pathname.startsWith("/s/")) return u.pathname + u.search;
  } catch {
    // not a fully-qualified URL — fall through to relative-path check
  }

  if (trimmed.startsWith("/s/")) return trimmed;
  return null;
}
