import { describe, expect, it } from "vitest";
import { computeNetworkSignal } from "@/lib/network-signal";

describe("computeNetworkSignal", () => {
  it("returns offline when navigator reports offline", () => {
    expect(computeNetworkSignal({ online: false }).bars).toBe(0);
  });

  it("defaults to strong when online but metrics are missing (desktop Wi‑Fi)", () => {
    const s = computeNetworkSignal({ online: true });
    expect(s.bars).toBe(4);
    expect(s.label).toBe("Strong");
  });

  it("does not mark poor from a lone low downlink without effectiveType", () => {
    const s = computeNetworkSignal({ online: true, downlink: 0.8 });
    expect(s.bars).toBeGreaterThanOrEqual(3);
  });

  it("respects effectiveType 3g", () => {
    const s = computeNetworkSignal({ online: true, effectiveType: "3g" });
    expect(s.bars).toBe(2);
    expect(s.label).toBe("Poor");
  });

  it("nudges down one level for save data instead of forcing weak", () => {
    const s = computeNetworkSignal({
      online: true,
      effectiveType: "4g",
      saveData: true,
    });
    expect(s.bars).toBe(3);
  });
});
