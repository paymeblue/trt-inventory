import { describe, expect, it } from "vitest";
import {
  nextSkuIndexForBase,
  normalizeSkuToken,
  skuBaseFromLabel,
  formatSkuSequence,
} from "@/lib/sku-from-label";

describe("skuBaseFromLabel", () => {
  it("uses first letters + slice for three+ word labels", () => {
    expect(skuBaseFromLabel("Top Upper Unit")).toMatch(/^tu-/);
  });

  it("uses two-word compound", () => {
    expect(skuBaseFromLabel("Lekki Phase")).toBe("le-ph");
  });
});

describe("formatSkuSequence & nextSkuIndexForBase", () => {
  it("allocates next index from existing skus", () => {
    const base = skuBaseFromLabel("Box Large");
    expect(
      formatSkuSequence(base, nextSkuIndexForBase(base, ["bo-la-001"])),
    ).toBe("bo-la-002");
  });

  it("starts at 001 when empty", () => {
    const base = "tu-un";
    expect(nextSkuIndexForBase(base, [])).toBe(1);
    expect(formatSkuSequence(base, 1)).toBe("tu-un-001");
  });
});

describe("normalizeSkuToken", () => {
  it("strips junk", () => {
    expect(normalizeSkuToken("  Foo & Bar!!! ")).toBe("foo-bar");
  });
});
