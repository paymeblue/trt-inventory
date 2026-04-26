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

/**
 * Returns the bare item barcode regardless of how the scanner encoded it.
 *
 * Both the QR and the CODE128 strip on every printed sticker now encode
 * the full `/s/<barcode>` deep-link URL — that way any 3rd-party phone
 * scanner (e.g. QR Bot) detects it as a URL and offers a tap-to-open
 * action even if it locks onto the linear barcode instead of the QR.
 *
 * The trade-off is that handheld USB scanners (which behave like a
 * keyboard) now type the full URL into the in-app scan input. This
 * helper unwraps that URL back to the bare barcode so the order page's
 * rapid-scan loop keeps working without a redirect on every read.
 *
 * For non-URL payloads (someone manually typing a barcode), it just
 * returns the trimmed input.
 */
export function extractBarcodeFromPayload(payload: string): string {
  const trimmed = payload.trim();
  if (!trimmed) return "";

  const deep = extractScanDeepLink(trimmed);
  if (!deep) return trimmed;

  // deep is "/s/<barcode>" or "/s/<barcode>?<qs>".
  const afterPrefix = deep.slice(3);
  const qIdx = afterPrefix.indexOf("?");
  const raw = qIdx >= 0 ? afterPrefix.slice(0, qIdx) : afterPrefix;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
