import { createHmac, timingSafeEqual } from "node:crypto";
import { getSessionSecret } from "@/lib/session";

/**
 * Printed-sticker scan tokens.
 *
 * Goal: zero-friction phone scanning. Every order item sticker now embeds
 * a short signed token so the URL a 3rd-party scanner (QR Bot, etc.) opens
 * can resolve the scan without forcing the installer through a login.
 *
 * Threat model
 * ------------
 * The token is **bound to a single barcode** and signed with the server's
 * `SESSION_SECRET`. A leaked sticker / photograph therefore only authorises
 * marking that one specific item as scanned — the same authority the
 * physical sticker on the goods already grants in real life. It cannot be
 * used to log in, view other orders, or scan other items.
 *
 * The token does NOT carry an installer identity; the `executeScan`
 * pipeline records it as a synthetic "Printed sticker" actor (see
 * `lib/printed-scan-actor.ts`) so the audit trail captures the source.
 *
 * Optional expiry
 * ---------------
 * Stickers can sit on inventory for weeks before being delivered, so by
 * default the token has no expiry. Operators can opt in to a TTL via the
 * `PRINTED_SCAN_TOKEN_TTL_MS` env var (e.g. for higher-value sites).
 */

interface SignedPayload {
  /** Bare barcode (e.g. `TRT-LHD2CTFJMVG9`). */
  b: string;
  /** Absolute ms timestamp of expiry, or null for no expiry. */
  exp: number | null;
}

/**
 * Mints a signed token for the given barcode.
 *
 * @param barcode  the bare barcode the token authorises
 * @param ttlMs    if > 0, sets `exp = Date.now() + ttlMs`. 0 / undefined
 *                 means the token never expires (sticker-friendly default).
 */
export function signPrintedScanToken(
  barcode: string,
  ttlMs?: number,
): string {
  const exp = ttlMs && ttlMs > 0 ? Date.now() + ttlMs : null;
  const payload: SignedPayload = { b: barcode, exp };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const sig = createHmac("sha256", getSessionSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

export type VerifyPrintedScanTokenResult =
  | { ok: true; barcode: string; exp: number | null }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "wrong_barcode" };

/**
 * Verifies a token and confirms it was minted for `expectedBarcode`.
 *
 * Bind-to-barcode check is mandatory: callers MUST pass the barcode that
 * the URL path was claimed against. This is what stops an attacker who
 * exfiltrated *one* sticker from generating valid URLs for other items.
 */
export function verifyPrintedScanToken(
  token: string,
  expectedBarcode: string,
): VerifyPrintedScanTokenResult {
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, reason: "malformed" };
  }
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return { ok: false, reason: "malformed" };

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", getSessionSecret())
    .update(body)
    .digest("base64url");
  let sigOk = false;
  try {
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expected, "utf8");
    sigOk = a.length === b.length && timingSafeEqual(a, b);
  } catch {
    sigOk = false;
  }
  if (!sigOk) return { ok: false, reason: "bad_signature" };

  let parsed: SignedPayload;
  try {
    parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SignedPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (typeof parsed.b !== "string" || parsed.b.length === 0) {
    return { ok: false, reason: "malformed" };
  }
  if (parsed.exp !== null && typeof parsed.exp !== "number") {
    return { ok: false, reason: "malformed" };
  }
  if (parsed.b !== expectedBarcode) {
    return { ok: false, reason: "wrong_barcode" };
  }
  if (parsed.exp !== null && Date.now() > parsed.exp) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, barcode: parsed.b, exp: parsed.exp };
}

/**
 * Reads the configured token TTL (in ms) from the env. Returns 0 (no
 * expiry) when unset or unparseable — that's the operator-friendly
 * default since stickers may be printed long before the goods ship.
 */
export function printedScanTokenTtlMs(): number {
  const raw = process.env.PRINTED_SCAN_TOKEN_TTL_MS?.trim();
  if (!raw) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}
