import { describe, it, expect } from "vitest";
import {
  pickActiveInstallerOrder,
  resolveInstallerFlow,
  type InstallerOrderSnapshot,
} from "@/lib/installer-flow";

const sample = (
  overrides: Partial<InstallerOrderSnapshot> = {},
): InstallerOrderSnapshot => ({
  id: "o1",
  projectName: "Acme HQ",
  status: "active",
  total: 5,
  scanned: 0,
  ...overrides,
});

describe("pickActiveInstallerOrder", () => {
  it("returns null when there are no orders", () => {
    expect(pickActiveInstallerOrder([])).toBeNull();
  });

  it("prefers an active order with pending items", () => {
    const result = pickActiveInstallerOrder([
      sample({ id: "fulfilled", status: "fulfilled", total: 2, scanned: 2 }),
      sample({ id: "in-progress", status: "active", total: 5, scanned: 1 }),
    ]);
    expect(result?.id).toBe("in-progress");
  });

  it("falls back to a fulfilled order when nothing is in progress", () => {
    const result = pickActiveInstallerOrder([
      sample({ id: "f1", status: "fulfilled", total: 3, scanned: 3 }),
    ]);
    expect(result?.id).toBe("f1");
  });

  it("treats anomaly orders with pending items as actionable", () => {
    const result = pickActiveInstallerOrder([
      sample({ id: "a1", status: "anomaly", total: 4, scanned: 1 }),
    ]);
    expect(result?.id).toBe("a1");
  });
});

describe("resolveInstallerFlow", () => {
  it("locks verify + resolve when there's no order yet", () => {
    const flow = resolveInstallerFlow([]);
    const byId = Object.fromEntries(flow.steps.map((s) => [s.id, s]));
    expect(byId["signed-in"].status).toBe("done");
    expect(byId["pick-order"].status).toBe("current");
    expect(byId["verify-items"].status).toBe("locked");
    expect(byId["resolve-order"].status).toBe("locked");
    expect(flow.currentOrder).toBeNull();
    expect(flow.currentStepIndex).toBe(1);
  });

  it("makes verify the current step when an order has pending items", () => {
    const flow = resolveInstallerFlow([
      sample({ id: "o1", total: 4, scanned: 1 }),
    ]);
    const byId = Object.fromEntries(flow.steps.map((s) => [s.id, s]));
    expect(byId["pick-order"].status).toBe("done");
    expect(byId["verify-items"].status).toBe("current");
    expect(byId["verify-items"].href).toBe("/orders/o1");
    expect(byId["resolve-order"].status).toBe("locked");
    expect(flow.currentStepIndex).toBe(2);
  });

  it("celebrates the resolved step when every item is scanned", () => {
    const flow = resolveInstallerFlow([
      sample({ id: "o1", status: "fulfilled", total: 3, scanned: 3 }),
    ]);
    const byId = Object.fromEntries(flow.steps.map((s) => [s.id, s]));
    expect(byId["verify-items"].status).toBe("done");
    expect(byId["resolve-order"].status).toBe("done");
  });

  it("never picks a sibling order when the relevant one is mid-verify", () => {
    const flow = resolveInstallerFlow([
      sample({
        id: "old",
        projectName: "Older",
        status: "fulfilled",
        total: 2,
        scanned: 2,
      }),
      sample({
        id: "current",
        projectName: "Current",
        status: "active",
        total: 5,
        scanned: 2,
      }),
    ]);
    expect(flow.currentOrder?.id).toBe("current");
    const verify = flow.steps.find((s) => s.id === "verify-items")!;
    expect(verify.meta).toBe("40%");
  });
});
