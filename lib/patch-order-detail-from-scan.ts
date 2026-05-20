import type { Order } from "@/db/schema";
import { computeProgress } from "@/lib/scan";
import type { ScanOutcome } from "@/lib/scan";

export type OrderDetailProgress = {
  total: number;
  scanned: number;
  remaining: number;
  percent: number;
};

type ScannableItem = {
  id: string;
  scannedAt: Date | string | null;
};

/**
 * Merges a successful scan API payload into order-detail cache so the UI
 * reflects fulfillment immediately (status pill, progress bar, resolved card).
 */
export function patchOrderDetailFromScan<
  T extends {
    order: Order;
    items: ScannableItem[];
    progress: OrderDetailProgress;
  },
>(
  prev: T | undefined,
  body: {
    outcome: ScanOutcome;
    order?: Order;
    progress?: OrderDetailProgress;
  },
): T | undefined {
  if (!prev) return prev;

  let items = prev.items;
  if (body.outcome.result === "valid") {
    const itemId = body.outcome.itemId;
    const scannedAt = new Date();
    items = prev.items.map((it) =>
      it.id === itemId ? { ...it, scannedAt } : it,
    ) as T["items"];
  }

  const nextOrder = body.order ?? prev.order;
  const nextProgress =
    body.progress ??
    computeProgress(
      items.map((it) => ({
        scannedAt:
          it.scannedAt instanceof Date
            ? it.scannedAt
            : it.scannedAt
              ? new Date(it.scannedAt)
              : null,
      })),
    );

  return { ...prev, order: nextOrder, items, progress: nextProgress };
}
