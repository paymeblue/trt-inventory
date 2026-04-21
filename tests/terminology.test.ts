import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Terminology guardrails. The product surface standardises on "verify"
 * for the installer's core action. These tests make it obvious in code
 * review if someone reintroduces the older "Scan" label as a navigation
 * or primary-CTA string, which was flagged as ambiguous.
 *
 * We only assert on the specific user-facing strings that were renamed,
 * so the word "scan" is still fine in technical contexts (barcode
 * scanners, scan-history logs, etc.).
 */
function load(relative: string) {
  return readFileSync(resolve(process.cwd(), relative), "utf8");
}

describe("installer-facing terminology", () => {
  it("sidebar uses 'Verify deliveries' for the installer nav entry", () => {
    const src = load("components/sidebar.tsx");
    expect(src).toContain("Verify deliveries");
    // The old bare label should no longer appear on that nav line.
    expect(src).not.toMatch(/label:\s*"Scan"/);
  });

  it("scan landing page heading is now 'Verify deliveries'", () => {
    const src = load("app/scan/page.tsx");
    expect(src).toContain("Verify deliveries");
    expect(src).not.toContain("Scan delivery</h1>");
  });

  it("scan landing CTA is 'Verify delivery' instead of 'Start scanning'", () => {
    const src = load("app/scan/page.tsx");
    expect(src).toContain("Verify delivery");
    expect(src).not.toContain("Start scanning");
  });

  it("manual input button says 'Verify' not 'Scan'", () => {
    const src = load("components/scan-input.tsx");
    // Look for the submit button label specifically.
    expect(src).toMatch(/>\s*Verify\s*</);
  });

  it("order page shows a 'Verification log' header", () => {
    const src = load("app/orders/[id]/page.tsx");
    expect(src).toContain("Verification log");
  });
});

/**
 * Projects-over-warehouse guardrail. After the refactor the global
 * "warehouse" concept went away — items live inside projects and are
 * unique per-project. These tests pin that rename down in the surfaces
 * users actually see, so a future commit can't silently resurrect the
 * old wording.
 */
describe("projects replace warehouse in user-facing copy", () => {
  it("sidebar no longer links to a warehouse page", () => {
    const src = load("components/sidebar.tsx");
    expect(src).toContain("/projects");
    expect(src).not.toMatch(/href:\s*"\/warehouse"/);
    expect(src).not.toMatch(/label:\s*"Warehouse"/);
  });

  it("help page talks about projects, not a global warehouse", () => {
    const src = load("app/help/page.tsx");
    expect(src).toContain("Create a project");
    // We still allow the word "warehouse" nowhere in the help copy now
    // that every item lives in a project.
    expect(src).not.toMatch(/warehouse/i);
  });

  it("dashboard quick actions reference projects instead of a warehouse", () => {
    const src = load("app/page.tsx");
    expect(src).toContain("Manage projects");
    expect(src).not.toContain("Manage warehouse");
  });

  it("old /warehouse route only exists as a redirect", () => {
    const src = load("app/warehouse/page.tsx");
    expect(src).toContain('redirect("/projects")');
  });
});
