import type { OrderItem, OrderStatus } from "@/db/schema";

export type ScanOutcome =
  | { result: "valid"; itemId: string }
  | { result: "duplicate"; itemId: string }
  | { result: "invalid"; barcode: string };

export interface ScanComputationInput {
  barcode: string;
  items: Pick<OrderItem, "id" | "barcode" | "scannedAt">[];
  orderStatus: OrderStatus;
}

export interface ScanComputationResult {
  outcome: ScanOutcome;
  /** new order status to persist; undefined means do not change */
  nextStatus?: OrderStatus;
}

/**
 * Pure scan-rule resolver.
 *
 * Rules:
 *   - valid:     product exists in the order and hasn't been scanned yet
 *   - duplicate: product exists and was already scanned — silently ignored
 *   - invalid:   product not found in the order — flagged as anomaly
 *
 * If an invalid scan occurs and the order isn't already fulfilled, the order
 * is marked anomaly. Once all items have been scanned, the order flips to
 * fulfilled.
 */
export function resolveScan(input: ScanComputationInput): ScanComputationResult {
  const { barcode, items, orderStatus } = input;
  const match = items.find((i) => i.barcode === barcode);

  if (!match) {
    return {
      outcome: { result: "invalid", barcode },
      nextStatus: orderStatus === "fulfilled" ? orderStatus : "anomaly",
    };
  }

  if (match.scannedAt !== null && match.scannedAt !== undefined) {
    return { outcome: { result: "duplicate", itemId: match.id } };
  }

  const remaining = items.filter(
    (i) => i.id !== match.id && (i.scannedAt === null || i.scannedAt === undefined),
  );

  const nextStatus: OrderStatus | undefined =
    remaining.length === 0 ? "fulfilled" : undefined;

  return {
    outcome: { result: "valid", itemId: match.id },
    nextStatus,
  };
}

export interface ProgressSummary {
  total: number;
  scanned: number;
  remaining: number;
  percent: number;
}

export function computeProgress(
  items: Pick<OrderItem, "scannedAt">[],
): ProgressSummary {
  const total = items.length;
  const scanned = items.filter((i) => i.scannedAt !== null && i.scannedAt !== undefined).length;
  const remaining = total - scanned;
  const percent = total === 0 ? 0 : Math.round((scanned / total) * 100);
  return { total, scanned, remaining, percent };
}
