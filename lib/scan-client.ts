import type { ScanOutcome } from "@/lib/scan";

/**
 * High-level classification of what happened on the wire for a scan call.
 *
 * This separates transport / auth / server failures from the scan business
 * outcomes so the UI never shows a red "invalid barcode" banner when the
 * real problem is that the network is down or the session expired.
 */
export type ScanCallResult =
  | {
      kind: "outcome";
      outcome: ScanOutcome;
      stock?: { sku: string; stockQuantity: number };
    }
  | { kind: "auth"; message: string }
  | { kind: "conflict"; message: string }
  | { kind: "server"; status: number; message: string }
  | { kind: "network"; message: string };

export interface ScanApiSuccessBody {
  outcome: ScanOutcome;
  stock?: { sku: string; stockQuantity: number };
}

export interface ScanApiErrorBody {
  error?: string;
}

/**
 * Classifies a fetch response from POST /api/orders/:id/scan into an
 * explicit ScanCallResult. Pure function — does not call fetch itself so it
 * is trivial to unit-test.
 */
export function classifyScanResponse(
  response: { ok: boolean; status: number },
  body: ScanApiSuccessBody | ScanApiErrorBody,
): ScanCallResult {
  if (response.ok) {
    const ok = body as ScanApiSuccessBody;
    return { kind: "outcome", outcome: ok.outcome, stock: ok.stock };
  }

  const err = body as ScanApiErrorBody;
  const message = err.error ?? `Unexpected error (HTTP ${response.status})`;

  if (response.status === 401 || response.status === 403) {
    return { kind: "auth", message };
  }
  if (response.status === 404 || response.status === 409) {
    return { kind: "conflict", message };
  }
  return { kind: "server", status: response.status, message };
}

export function classifyNetworkError(err: unknown): ScanCallResult {
  const message =
    err instanceof Error ? err.message : "Network request failed";
  return { kind: "network", message };
}
