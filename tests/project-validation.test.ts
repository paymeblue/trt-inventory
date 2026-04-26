import { describe, expect, it } from "vitest";
import {
  createProjectBodySchema,
  findDuplicateSkuInPayload,
  projectItemInputSchema,
} from "@/lib/project-validation";

describe("findDuplicateSkuInPayload", () => {
  it("returns null for an empty list", () => {
    expect(findDuplicateSkuInPayload([])).toBeNull();
  });

  it("returns null when every SKU is unique", () => {
    expect(
      findDuplicateSkuInPayload([
        { sku: "A-1" },
        { sku: "B-2" },
        { sku: "c-3" },
      ]),
    ).toBeNull();
  });

  it("detects exact duplicate SKUs", () => {
    expect(
      findDuplicateSkuInPayload([{ sku: "X" }, { sku: "Y" }, { sku: "X" }]),
    ).toBe("X");
  });

  it("treats SKUs as duplicate when they differ only by case", () => {
    expect(
      findDuplicateSkuInPayload([{ sku: "inv-1" }, { sku: "INV-1" }]),
    ).toBe("INV-1");
  });

  it("ignores leading and trailing whitespace when comparing", () => {
    expect(
      findDuplicateSkuInPayload([{ sku: "  same  " }, { sku: "same" }]),
    ).toBe("same");
  });
});

describe("projectItemInputSchema", () => {
  it("accepts a minimal valid item", () => {
    expect(projectItemInputSchema.parse({ sku: "S1", name: "Widget" })).toEqual(
      {
        sku: "S1",
        name: "Widget",
        stockQuantity: 1,
      },
    );
  });

  it("rejects zero stock", () => {
    expect(() =>
      projectItemInputSchema.parse({ sku: "S", name: "N", stockQuantity: 0 }),
    ).toThrow();
  });

  it("trims sku and name", () => {
    expect(
      projectItemInputSchema.parse({
        sku: "  trim-me  ",
        name: "  name  ",
        stockQuantity: 3,
      }),
    ).toEqual({
      sku: "trim-me",
      name: "name",
      stockQuantity: 3,
    });
  });

  it("rejects an empty SKU after trim", () => {
    expect(() =>
      projectItemInputSchema.parse({ sku: "   ", name: "N" }),
    ).toThrow();
  });

  it("rejects negative stock", () => {
    expect(() =>
      projectItemInputSchema.parse({ sku: "S", name: "N", stockQuantity: -1 }),
    ).toThrow();
  });

  it("rejects non-integer stock", () => {
    expect(() =>
      projectItemInputSchema.parse({
        sku: "S",
        name: "N",
        stockQuantity: 1.5,
      }),
    ).toThrow();
  });

  it("rejects SKU longer than 80 chars", () => {
    expect(() =>
      projectItemInputSchema.parse({ sku: "x".repeat(81), name: "N" }),
    ).toThrow();
  });

  it("rejects name longer than 160 chars", () => {
    expect(() =>
      projectItemInputSchema.parse({ sku: "S", name: "n".repeat(161) }),
    ).toThrow();
  });
});

describe("createProjectBodySchema", () => {
  it("parses a project with no items (undefined items)", () => {
    const out = createProjectBodySchema.parse({
      name: "Solo",
    });
    expect(out).toEqual({
      name: "Solo",
      items: [],
    });
  });

  it("treats null items as an empty list", () => {
    const out = createProjectBodySchema.parse({
      name: "P",
      items: null,
    });
    expect(out.items).toEqual([]);
  });

  it("trims project name and optional description", () => {
    const out = createProjectBodySchema.parse({
      name: "  My Project  ",
      description: "  desc  ",
      items: [],
    });
    expect(out.name).toBe("My Project");
    expect(out.description).toBe("desc");
  });

  it("rejects an empty project name after trim", () => {
    expect(() =>
      createProjectBodySchema.parse({ name: "   ", items: [] }),
    ).toThrow();
  });

  it("rejects description over 500 chars", () => {
    expect(() =>
      createProjectBodySchema.parse({
        name: "OK",
        description: "d".repeat(501),
      }),
    ).toThrow();
  });

  it("rejects more than 200 line items", () => {
    expect(() =>
      createProjectBodySchema.parse({
        name: "Big",
        items: Array.from({ length: 201 }, (_, i) => ({
          sku: `S-${i}`,
          name: `Item ${i}`,
        })),
      }),
    ).toThrow();
  });

  it("accepts exactly 200 line items", () => {
    const out = createProjectBodySchema.parse({
      name: "Max",
      items: Array.from({ length: 200 }, (_, i) => ({
        sku: `S-${i}`,
        name: `Item ${i}`,
      })),
    });
    expect(out.items).toHaveLength(200);
  });

  it("parses nested items with explicit stock", () => {
    const out = createProjectBodySchema.parse({
      name: "With stock",
      items: [{ sku: "A", name: "One", stockQuantity: 42 }],
    });
    expect(out.items[0]).toEqual({
      sku: "A",
      name: "One",
      stockQuantity: 42,
    });
  });

  it("rejects unknown top-level keys when using strict — schema is not strict", () => {
    const out = createProjectBodySchema.parse({
      name: "Strip",
      items: [],
      extra: "ignored",
    } as { name: string; items: []; extra?: string });
    expect("extra" in out).toBe(false);
  });
});
