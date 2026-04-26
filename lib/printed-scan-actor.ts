import type { AuthenticatedActor } from "@/lib/auth-guard";

/**
 * Synthetic actor used when a scan is authorised by a printed-sticker
 * token rather than an installer's iron-session cookie.
 *
 * The flag `isPrintedScan: true` is what distinguishes it from a real
 * user; the scan-execution pipeline (`lib/scan-execute.ts`) keys off
 * that flag to omit the user FK columns (`scanned_by_id`,
 * `stock_movements.user_id`) so the synthetic id never reaches the DB.
 *
 * `name` is what shows up on the order detail page next to each scan,
 * so it's intentionally human-readable: PMs viewing the audit trail
 * can immediately tell that the deduction came from a sticker scan.
 */
export const PRINTED_SCAN_ACTOR_NAME = "Printed sticker";

export function getPrintedScanActor(): AuthenticatedActor {
  return {
    userId: "",
    email: "sticker@trt.local",
    role: "installer",
    name: PRINTED_SCAN_ACTOR_NAME,
    isPrintedScan: true,
  };
}
