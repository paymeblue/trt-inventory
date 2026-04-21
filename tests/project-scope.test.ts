import { describe, expect, it } from "vitest";
import {
  canAddItemToOrder,
  canDeleteProject,
  findProjectItem,
  type ScopedItem,
} from "@/lib/project-scope";

/**
 * These tests pin down the "items live inside a project" invariants
 * that came in with the warehouse → project refactor. They mirror the
 * server-side checks in `app/api/orders/[id]/items/route.ts` and
 * `/api/projects/[id]` so a regression in either place still trips a
 * red light at the unit level.
 */
describe("project scoping invariants", () => {
  const projectA = "00000000-0000-0000-0000-00000000000a";
  const projectB = "00000000-0000-0000-0000-00000000000b";

  const items: ScopedItem[] = [
    { projectId: projectA, sku: "INV-001" },
    { projectId: projectA, sku: "PAN-001" },
    { projectId: projectB, sku: "INV-001" }, // same SKU, different project
  ];

  describe("findProjectItem", () => {
    it("resolves a SKU scoped to the right project", () => {
      expect(findProjectItem(items, projectA, "INV-001")).toEqual({
        projectId: projectA,
        sku: "INV-001",
      });
    });

    it("never returns the same-named SKU from another project", () => {
      const found = findProjectItem(items, projectA, "INV-001");
      expect(found?.projectId).toBe(projectA);
      expect(found?.projectId).not.toBe(projectB);
    });

    it("returns undefined when the SKU doesn't exist in that project", () => {
      // PAN-001 only exists in Project A
      expect(findProjectItem(items, projectB, "PAN-001")).toBeUndefined();
    });

    it("treats identical SKUs across projects as independent rows", () => {
      expect(findProjectItem(items, projectA, "INV-001")).toBeDefined();
      expect(findProjectItem(items, projectB, "INV-001")).toBeDefined();
    });
  });

  describe("canAddItemToOrder", () => {
    it("accepts an item that belongs to the order's project", () => {
      const d = canAddItemToOrder(
        { projectId: projectA },
        { projectId: projectA, sku: "INV-001" },
      );
      expect(d.ok).toBe(true);
    });

    it("rejects an item from a different project", () => {
      const d = canAddItemToOrder(
        { projectId: projectA },
        { projectId: projectB, sku: "INV-001" },
      );
      expect(d.ok).toBe(false);
      if (!d.ok) {
        expect(d.reason).toBe("cross_project_item");
        if (d.reason === "cross_project_item") {
          expect(d.itemProjectId).toBe(projectB);
        }
      }
    });

    it("rejects when the SKU doesn't exist at all", () => {
      const d = canAddItemToOrder({ projectId: projectA }, undefined);
      expect(d.ok).toBe(false);
      if (!d.ok) expect(d.reason).toBe("sku_not_in_project");
    });
  });

  describe("canDeleteProject", () => {
    it("allows deleting an empty project", () => {
      expect(canDeleteProject(0)).toBe(true);
    });

    it("blocks deletion while the project still has orders", () => {
      expect(canDeleteProject(1)).toBe(false);
      expect(canDeleteProject(42)).toBe(false);
    });
  });
});

/**
 * Surface-area guardrail: the old /api/products endpoints used a global
 * SKU uniqueness model that the refactor intentionally broke. If those
 * files ever come back, someone is almost certainly trying to treat
 * items as cross-project again — which would silently reintroduce the
 * exact bug the refactor fixed.
 */
describe("legacy global /api/products endpoints are gone", () => {
  it("has no /api/products route files", async () => {
    const fs = await import("node:fs");
    expect(fs.existsSync("app/api/products/route.ts")).toBe(false);
    expect(fs.existsSync("app/api/products/[id]/route.ts")).toBe(false);
  });
});
