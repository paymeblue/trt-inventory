import { db } from "@/db";
import { disputeEvents } from "@/db/schema";

export async function recordDisputeEvent(params: {
  disputeId: string;
  userId: string | null;
  eventType: string;
  detail?: Record<string, unknown> | null;
}) {
  await db.insert(disputeEvents).values({
    disputeId: params.disputeId,
    userId: params.userId,
    eventType: params.eventType,
    detail: params.detail ?? null,
  });
}

