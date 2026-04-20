import { describe, expect, it } from "vitest";
import { resolveTheme, themeBootstrapScript } from "@/lib/theme";

/**
 * The theme resolver is tiny but wrong behaviour here means users get
 * the wrong palette on page load — the sort of regression that's
 * obvious to every user yet subtle to catch in code review. Lock the
 * truth table down with tests.
 */
describe("resolveTheme", () => {
  it("respects explicit user choice over system preference", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("follows system preference when choice is 'system'", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("defaults to light when system says light and choice is system", () => {
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("themeBootstrapScript", () => {
  it("includes the storage key so the script reads the user's persisted choice", () => {
    expect(themeBootstrapScript).toContain("trt.theme");
  });

  it("branches on matchMedia prefers-color-scheme", () => {
    expect(themeBootstrapScript).toContain("prefers-color-scheme: dark");
  });

  it("sets data-theme on <html> (the CSS anchor for all overrides)", () => {
    expect(themeBootstrapScript).toContain("data-theme");
  });

  it("is wrapped in try/catch so a storage exception doesn't break boot", () => {
    expect(themeBootstrapScript).toContain("try");
    expect(themeBootstrapScript).toContain("catch");
  });
});
