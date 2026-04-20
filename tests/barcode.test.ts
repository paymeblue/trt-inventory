import { describe, expect, it } from "vitest";
import { generateBarcode, isValidBarcodeShape } from "@/lib/barcode";

describe("generateBarcode", () => {
  it("matches the TRT-XXXXXXXXXXXX format", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateBarcode();
      expect(isValidBarcodeShape(code)).toBe(true);
      expect(code.startsWith("TRT-")).toBe(true);
      expect(code.length).toBe(16);
    }
  });

  it("produces unique values across many generations", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generateBarcode());
    expect(seen.size).toBe(1000);
  });

  it("only produces upper-case alphanumerics in the body", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateBarcode();
      const body = code.slice(4);
      expect(body).toMatch(/^[A-Z0-9]{12}$/);
    }
  });

  it("returned values are CODE128-safe (no whitespace, no control chars)", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateBarcode();
      expect(code).not.toMatch(/\s/);
      // eslint-disable-next-line no-control-regex
      expect(code).not.toMatch(/[\x00-\x1f\x7f]/);
    }
  });
});

describe("isValidBarcodeShape", () => {
  it("accepts correctly formatted barcodes", () => {
    expect(isValidBarcodeShape("TRT-ABCDEFGHIJ12")).toBe(true);
    expect(isValidBarcodeShape("TRT-000000000000")).toBe(true);
    expect(isValidBarcodeShape("TRT-ZZZZZZZZZZZZ")).toBe(true);
  });

  it("rejects wrong prefixes, lengths, or lowercase chars", () => {
    expect(isValidBarcodeShape("XYZ-ABCDEFGHIJ12")).toBe(false);
    expect(isValidBarcodeShape("TRT-ABC")).toBe(false);
    expect(isValidBarcodeShape("TRT-abcdefghij12")).toBe(false);
    expect(isValidBarcodeShape("")).toBe(false);
  });

  it("rejects barcodes with special characters or whitespace", () => {
    expect(isValidBarcodeShape("TRT-ABCDEF-HIJ12")).toBe(false);
    expect(isValidBarcodeShape("TRT-ABCDEF HIJ12")).toBe(false);
    expect(isValidBarcodeShape("TRT-ABCDEF!HIJ12")).toBe(false);
    expect(isValidBarcodeShape(" TRT-ABCDEFGHIJ12")).toBe(false);
    expect(isValidBarcodeShape("TRT-ABCDEFGHIJ12 ")).toBe(false);
  });

  it("rejects off-by-one lengths", () => {
    expect(isValidBarcodeShape("TRT-ABCDEFGHIJ1")).toBe(false); // 11
    expect(isValidBarcodeShape("TRT-ABCDEFGHIJ123")).toBe(false); // 13
  });

  it("never accepts newlines or line endings", () => {
    expect(isValidBarcodeShape("TRT-ABCDEFGHIJ12\n")).toBe(false);
    expect(isValidBarcodeShape("TRT-ABCDEFGHIJ12\r")).toBe(false);
    expect(isValidBarcodeShape("\nTRT-ABCDEFGHIJ12")).toBe(false);
  });

  it("is deterministic for the same input (pure function)", () => {
    const code = "TRT-ABCDEFGHIJ12";
    const a = isValidBarcodeShape(code);
    const b = isValidBarcodeShape(code);
    const c = isValidBarcodeShape(code);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});
