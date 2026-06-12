import { describe, expect, it } from "vitest";
import { canPrintPackingLabels } from "@/lib/packing-label-access";

/**
 * Stickers (packing labels) are a PM / super-admin concern only.
 * Logistics and receivers scan the physical boxes — they must never be
 * offered the label artwork or print actions in the app.
 */
describe("canPrintPackingLabels", () => {
  it("allows the PM", () => {
    expect(canPrintPackingLabels("pm")).toBe(true);
  });

  it("allows the super-admin", () => {
    expect(canPrintPackingLabels("super_admin")).toBe(true);
  });

  it("denies logistics — they verify boxes, they do not print stickers", () => {
    expect(canPrintPackingLabels("logistics")).toBe(false);
  });

  it("denies receivers (installer role)", () => {
    expect(canPrintPackingLabels("installer")).toBe(false);
  });
});
