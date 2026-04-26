import { describe, it, expect } from "vitest";
import { generateTempPassword } from "@/lib/temp-password";

describe("generateTempPassword", () => {
  it("produces a password of the requested length", () => {
    const p = generateTempPassword(12);
    expect(p).toHaveLength(12);
  });

  it("uses url-safe characters only (no - or _)", () => {
    for (let i = 0; i < 50; i++) {
      const p = generateTempPassword(16);
      expect(p).toMatch(/^[A-Za-z0-9]+$/);
    }
  });

  it("rejects unsafely short lengths", () => {
    expect(() => generateTempPassword(7)).toThrow();
  });

  it("returns sufficiently random output", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(generateTempPassword(12));
    expect(seen.size).toBeGreaterThan(190);
  });
});
