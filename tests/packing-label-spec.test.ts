import { describe, expect, it } from "vitest";
import { PACKING_LABEL } from "@/lib/packing-label-spec";

describe("PACKING_LABEL", () => {
  it("matches Xprinter XP-365B 1.5×1 in stock", () => {
    expect(PACKING_LABEL.widthIn).toBe(1.5);
    expect(PACKING_LABEL.heightIn).toBe(1);
    expect(PACKING_LABEL.printerModel).toContain("XP-365B");
  });
});
