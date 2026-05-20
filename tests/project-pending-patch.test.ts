import { describe, expect, it } from "vitest";
import {
  effectiveItemDisplay,
  effectiveProjectFields,
  mergeItemChangeIntoPatch,
  pendingPatchHasWork,
} from "@/lib/project-pending-patch";

describe("project pending patch", () => {
  it("merges item rename into pending patch", () => {
    const merged = mergeItemChangeIntoPatch(null, {
      itemId: "item-1",
      name: "New label",
    });
    expect(merged.itemChanges).toHaveLength(1);
    expect(merged.itemChanges?.[0]?.name).toBe("New label");
    expect(pendingPatchHasWork(merged)).toBe(true);
  });

  it("shows effective project title from pending patch", () => {
    const fields = effectiveProjectFields({
      name: "Live title",
      description: null,
      siteAddress: null,
      siteLatitude: null,
      siteLongitude: null,
      pendingPatch: { name: "Queued title" },
    });
    expect(fields.name).toBe("Queued title");
  });

  it("shows pending item display values", () => {
    const d = effectiveItemDisplay(
      { id: "x", name: "Old", sku: "SKU-1", stockQuantity: 2 },
      { itemId: "x", name: "New", delta: 1 },
    );
    expect(d.name).toBe("New");
    expect(d.stockQuantity).toBe(3);
    expect(d.hasPendingEdit).toBe(true);
  });
});
