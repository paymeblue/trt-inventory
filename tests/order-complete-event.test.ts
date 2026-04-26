import { describe, expect, it, vi } from "vitest";
import { runWithObservabilityContext } from "@/lib/observability/context";
import { logOrderCompleteEvent } from "@/lib/order-complete-event";
import type { Order } from "@/db/schema";

describe("logOrderCompleteEvent", () => {
  it("emits a structured info line with order.complete", () => {
    const prevFormat = process.env.LOG_FORMAT;
    process.env.LOG_FORMAT = "json";

    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((c) => {
      chunks.push(typeof c === "string" ? c : c.toString());
      return true;
    });

    const order: Order = {
      id: "order-uuid",
      projectId: "proj-uuid",
      status: "fulfilled",
      createdBy: "PM",
      createdById: null,
      createdAt: new Date(),
      completedAt: null,
      fulfilledAt: new Date("2026-04-26T12:00:00.000Z"),
    };

    runWithObservabilityContext(
      { requestId: "test-req-id" },
      () => {
        logOrderCompleteEvent({
          orderId: order.id,
          order,
          actor: {
            userId: "user-1",
            email: "installer@example.com",
            role: "installer",
            name: "Ada",
          },
          progress: { total: 5, scanned: 5, remaining: 0, percent: 100 },
        });
      },
    );

    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const line = chunks.join("");
    const record = JSON.parse(line.trim()) as Record<string, unknown>;
    expect(record.msg).toBe("order.complete");
    expect(record.requestId).toBe("test-req-id");
    expect(record.orderId).toBe("order-uuid");
    expect(record.projectId).toBe("proj-uuid");
    expect(record.itemsVerified).toBe(5);
    expect(record.fulfilledAt).toBe("2026-04-26T12:00:00.000Z");

    spy.mockRestore();
    process.env.LOG_FORMAT = prevFormat;
  });
});
