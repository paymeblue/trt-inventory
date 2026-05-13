import { describe, expect, it } from "vitest";
import { packingLineCountForStock } from "@/lib/packing-lines";

describe("packingLineCountForStock", () => {
  it("returns quantity for positive integers", () => {
    expect(packingLineCountForStock(1)).toBe(1);
    expect(packingLineCountForStock(10)).toBe(10);
    expect(packingLineCountForStock(100)).toBe(100);
  });

  it("floors fractional values", () => {
    expect(packingLineCountForStock(3.9)).toBe(3);
  });

  it("returns zero for non-positive", () => {
    expect(packingLineCountForStock(0)).toBe(0);
    expect(packingLineCountForStock(-1)).toBe(0);
    expect(packingLineCountForStock(NaN)).toBe(0);
  });

  it("accepts numeric strings", () => {
    expect(packingLineCountForStock("5")).toBe(5);
    expect(packingLineCountForStock("0")).toBe(0);
  });
});
