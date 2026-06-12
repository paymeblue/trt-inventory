import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardrails for the project approval → print → warehouse-verify →
 * activate → order → receive lifecycle. Each assertion pins a rule that
 * was agreed with the business:
 *
 *   1. Super-admin can always override every step.
 *   2. Stickers (packing label previews / print sheets) exist only on
 *      PM / super-admin surfaces — never on logistics or receiver views.
 *   3. Receivers only see a project after the PM creates a delivery order.
 *   4. Projects list is sorted newest → oldest.
 *   5. The PM is forced through the "print barcodes" gate after approval.
 *
 * These are source-level checks (same pattern as terminology.test.ts):
 * they fail loudly in review if someone rewires a role or reintroduces
 * sticker UI on the wrong page. The full UI journey is covered by
 * cypress/e2e/project-approval-flow.cy.ts.
 */
function load(relative: string) {
  return readFileSync(resolve(process.cwd(), relative), "utf8");
}

describe("super-admin override", () => {
  it("warehouse gate scan accepts logistics and super_admin", () => {
    const src = load("app/api/projects/[id]/logistics-gate/scan/route.ts");
    expect(src).toMatch(/requireUserAny\(\["logistics", "super_admin"\]\)/);
  });

  it("logistics_fulfill (project activation) accepts logistics and super_admin", () => {
    const src = load("app/api/projects/[id]/approval/route.ts");
    const fulfillBlock = src.slice(src.indexOf('"logistics_fulfill"'));
    expect(fulfillBlock).toMatch(
      /requireUserAny\(\["logistics", "super_admin"\]\)/,
    );
  });

  it("on-site verification scan accepts installer and super_admin", () => {
    const src = load("app/api/orders/[id]/scan/route.ts");
    expect(src).toMatch(/requireUserAny\(\["installer", "super_admin"\]\)/);
  });

  it("assigned-receiver restriction is bypassed for super_admin in executeScan", () => {
    const src = load("lib/scan-execute.ts");
    expect(src).toContain('actor.role !== "super_admin"');
  });

  it("warehouse scan page admits logistics and super_admin", () => {
    const src = load("app/projects/[id]/logistics-scan/page.tsx");
    expect(src).toContain("user?.role === 'logistics' || user?.role === 'super_admin'");
  });
});

describe("stickers are PM / super-admin only", () => {
  it("logistics warehouse scan page renders no sticker components", () => {
    const src = load("app/projects/[id]/logistics-scan/page.tsx");
    expect(src).not.toContain("PackingLabelPreview");
    expect(src).not.toContain("PackingLabelPrintSheet");
    expect(src).not.toContain("PrintPackingLabelsButton");
    expect(src).not.toContain("Packing stickers");
    expect(src).not.toContain("Open sticker URL");
  });

  it("order detail page gates the sticker preview and print sheet by role", () => {
    const src = load("app/orders/[id]/page.tsx");
    expect(src).toContain(
      "user && canPrintPackingLabels(user.role) && (\n        <PackingLabelPreview",
    );
    expect(src).toContain(
      "canPrintPackingLabels(user.role) && (\n        <PackingLabelPrintSheet",
    );
  });

  it("logistics-gate API only signs sticker tokens for PM / super-admin", () => {
    const src = load("app/api/projects/[id]/logistics-gate/route.ts");
    expect(src).toContain("includeStickerTokens");
    expect(src).toMatch(
      /auth\.actor\.role === "pm" \|\| auth\.actor\.role === "super_admin"/,
    );
  });

  it("order detail API only signs sticker tokens for PM / super-admin", () => {
    const src = load("app/api/orders/[id]/route.ts");
    expect(src).toContain("includeStickerTokens");
    expect(src).toMatch(
      /auth\.actor\.role === "pm" \|\| auth\.actor\.role === "super_admin"/,
    );
  });

  it("the print surface itself stays PM / super-admin only", () => {
    const src = load("app/projects/[id]/print-barcodes/page.tsx");
    expect(src).toContain('user.role !== "pm" && user.role !== "super_admin"');
  });

  it("marking labels printed is PM / super-admin only", () => {
    const src = load("app/api/projects/[id]/logistics-gate/printed/route.ts");
    expect(src).toMatch(/requireUserAny\(\["pm", "super_admin"\]\)/);
  });

  it("print page lets the PM pick exact barcodes and decrements after print", () => {
    const src = load("app/projects/[id]/print-barcodes/page.tsx");
    expect(src).toContain("Print selected");
    expect(src).toContain("labels left to print");
    expect(src).toContain("labelPrintedAt");
  });
});

describe("receiver visibility requires a PM delivery order", () => {
  it("projects list filters installer view by existing delivery orders", () => {
    const src = load("app/api/projects/route.ts");
    expect(src).toContain('actor.role === "installer"');
    expect(src).toContain("isLogisticsGate, false");
  });

  it("project detail blocks installers until a delivery order exists", () => {
    const src = load("app/api/projects/[id]/route.ts");
    expect(src).toContain(
      "This project is not visible until the PM creates a delivery order.",
    );
  });
});

describe("projects list ordering and PM print gate", () => {
  it("projects are sorted newest → oldest", () => {
    const src = load("app/api/projects/route.ts");
    expect(src).toContain("desc(projects.createdAt)");
    expect(src).not.toContain("asc(projects.name)");
  });

  it("projects page mounts the post-approval print-barcodes modal", () => {
    const src = load("app/projects/page.tsx");
    expect(src).toContain("PrintBarcodesGateModal");
    expect(src).toContain("Print barcodes now");
    expect(src).toContain("Approved project barcodes");
  });

  it("warehouse activation is phrased as approval for the PM order step", () => {
    const src = load("app/projects/[id]/logistics-scan/page.tsx");
    expect(src).toContain("Approve for PM to create order");
    expect(src).toContain("Approve project");
    expect(src).not.toContain("Activate for receivers");
  });
});
