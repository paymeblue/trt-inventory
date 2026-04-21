import { describe, expect, it } from "vitest";
import { buildInitialStockMovementInserts } from "@/lib/project-create-stock";

const uid = "00000000-0000-0000-0000-000000000099";

describe("buildInitialStockMovementInserts", () => {
  it("returns an empty array when there are no products", () => {
    expect(buildInitialStockMovementInserts([], [{ sku: "A", stockQuantity: 5 }], uid)).toEqual(
      [],
    );
  });

  it("skips lines with zero stock", () => {
    const rows = buildInitialStockMovementInserts(
      [{ id: "p1", sku: "A" }],
      [{ sku: "A", stockQuantity: 0 }],
      uid,
    );
    expect(rows).toEqual([]);
  });

  it("emits one movement per product with positive stock", () => {
    const rows = buildInitialStockMovementInserts(
      [
        { id: "id-a", sku: "SKU-A" },
        { id: "id-b", sku: "SKU-B" },
      ],
      [
        { sku: "SKU-A", stockQuantity: 10 },
        { sku: "SKU-B", stockQuantity: 2 },
      ],
      uid,
    );
    expect(rows).toEqual([
      { productId: "id-a", delta: 10, reason: "initial", userId: uid },
      { productId: "id-b", delta: 2, reason: "initial", userId: uid },
    ]);
  });

  it("matches request lines to DB rows case-insensitively", () => {
    const rows = buildInitialStockMovementInserts(
      [{ id: "x", sku: "Inv-1" }],
      [{ sku: "inv-1", stockQuantity: 7 }],
      uid,
    );
    expect(rows).toEqual([
      { productId: "x", delta: 7, reason: "initial", userId: uid },
    ]);
  });

  it("handles RETURNING order differing from the request payload order", () => {
    const requested = [
      { sku: "Z", stockQuantity: 1 },
      { sku: "A", stockQuantity: 9 },
    ];
    const inserted = [
      { id: "second", sku: "A" },
      { id: "first", sku: "Z" },
    ];
    const rows = buildInitialStockMovementInserts(inserted, requested, uid);
    expect(rows).toContainEqual({
      productId: "second",
      delta: 9,
      reason: "initial",
      userId: uid,
    });
    expect(rows).toContainEqual({
      productId: "first",
      delta: 1,
      reason: "initial",
      userId: uid,
    });
    expect(rows).toHaveLength(2);
  });
});
