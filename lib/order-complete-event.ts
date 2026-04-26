import type { Order } from "@/db/schema";
import type { AuthenticatedActor } from "@/lib/auth-guard";
import { getLogger } from "@/lib/observability/logger";
import type { ProgressSummary } from "@/lib/scan";

/**
 * Domain event: last item scanned and order is fulfilled. Structured log is
 * ready for log aggregators (filter `msg` = `order.complete`).
 */
export function logOrderCompleteEvent(payload: {
  orderId: string;
  order: Order;
  actor: AuthenticatedActor;
  progress: ProgressSummary;
}): void {
  const { orderId, order, actor, progress } = payload;
  getLogger().info("order.complete", {
    orderId,
    projectId: order.projectId,
    completedByUserId: actor.userId,
    completedByName: actor.name,
    itemsVerified: progress.total,
    fulfilledAt: order.fulfilledAt?.toISOString() ?? null,
  });
}
