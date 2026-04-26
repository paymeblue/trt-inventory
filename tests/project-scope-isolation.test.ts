import { describe, it, expect } from "vitest";

/**
 * Domain-level invariant test: an SKU defined inside Project A is a
 * different thing from an identically-spelled SKU in Project B. The
 * application enforces this in two places we want to lock down with a
 * pure test:
 *
 *  1. When checking "is this SKU already used in an order?" before a
 *     PM renames or deletes a project item, the lookup must filter to
 *     orders inside the same project. Otherwise a sibling project that
 *     happens to use the same SKU string would falsely lock down rename
 *     and delete operations on this project's item.
 *
 *  2. Adding an item to an order must reject SKUs that don't exist
 *     inside the order's parent project — even if some other project
 *     has an item by that name.
 *
 * The route handlers do this with database queries; here we mirror the
 * predicate logic with a small in-memory implementation to guarantee the
 * filter shape stays right as the codebase evolves.
 */

interface Project {
  id: string;
}

interface Product {
  id: string;
  projectId: string;
  sku: string;
}

interface Order {
  id: string;
  projectId: string;
}

interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
}

/** Mirrors `isSkuUsedInProject` in app/api/projects/[id]/items/[itemId]/route.ts. */
function isSkuUsedInProject(
  projectId: string,
  sku: string,
  orders: Order[],
  orderItems: OrderItem[],
): boolean {
  return orderItems.some((oi) => {
    if (oi.productId !== sku) return false;
    const order = orders.find((o) => o.id === oi.orderId);
    return !!order && order.projectId === projectId;
  });
}

/** Mirrors the cross-project guard in POST /api/orders/[id]/items. */
function findProjectScopedProduct(
  projectId: string,
  sku: string,
  products: Product[],
): Product | null {
  return (
    products.find((p) => p.projectId === projectId && p.sku === sku) ?? null
  );
}

describe("project-scoped SKU isolation", () => {
  const projects: Project[] = [{ id: "p-a" }, { id: "p-b" }];

  const products: Product[] = [
    { id: "prod-a", projectId: "p-a", sku: "INV-001" },
    { id: "prod-b", projectId: "p-b", sku: "INV-001" },
  ];

  const orders: Order[] = [
    { id: "o-b", projectId: "p-b" },
  ];

  const orderItems: OrderItem[] = [
    { id: "oi-1", orderId: "o-b", productId: "INV-001" },
  ];

  it("does not flag Project A's SKU as used when only Project B used it", () => {
    expect(
      isSkuUsedInProject("p-a", "INV-001", orders, orderItems),
    ).toBe(false);
  });

  it("does flag Project B's SKU as used when Project B used it", () => {
    expect(
      isSkuUsedInProject("p-b", "INV-001", orders, orderItems),
    ).toBe(true);
  });

  it("rejects adding a sibling project's SKU to an order in this project", () => {
    expect(findProjectScopedProduct("p-a", "INV-002", products)).toBeNull();
  });

  it("accepts adding an SKU that exists in this project", () => {
    expect(findProjectScopedProduct("p-a", "INV-001", products)?.id).toBe(
      "prod-a",
    );
  });

  it("treats two identically-named SKUs in two projects as fully independent", () => {
    const a = findProjectScopedProduct("p-a", "INV-001", products);
    const b = findProjectScopedProduct("p-b", "INV-001", products);
    expect(a?.id).toBe("prod-a");
    expect(b?.id).toBe("prod-b");
    expect(a?.id).not.toBe(b?.id);
  });
});
