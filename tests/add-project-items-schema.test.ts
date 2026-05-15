import { describe, expect, it } from "vitest";
import { addProjectItemsBodySchema } from "@/lib/project-validation";

describe("addProjectItemsBodySchema", () => {
  it("allows category batch without free-text name", () => {
    const out = addProjectItemsBodySchema.parse({
      categoryId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      quantity: 3,
    });
    expect(out.quantity).toBe(3);
  });

  it("requires name when not using a category", () => {
    expect(() =>
      addProjectItemsBodySchema.parse({ quantity: 2 }),
    ).toThrow();
  });

  it("allows custom batch with name + quantity", () => {
    const out = addProjectItemsBodySchema.parse({
      name:  "Cooler",
      quantity: 4,
    });
    expect(out.name).toBe("Cooler");
    expect(out.quantity).toBe(4);
  });

  it("allows legacy single-row body", () => {
    const out = addProjectItemsBodySchema.parse({
      sku: "x-001",
      name: "One row",
      stockQuantity: 5,
    });
    expect(out.stockQuantity).toBe(5);
  });
});
