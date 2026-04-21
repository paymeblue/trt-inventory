/**
 * Pure helpers that express the project-scoping invariants. Kept
 * framework-free so they can be unit-tested without a database and
 * reused by both the API layer and future client-side validation.
 *
 * The two invariants:
 *   1. A SKU is unique only within its parent project.
 *   2. An order can only reference items that belong to the same
 *      project as the order itself.
 */

export interface ScopedItem {
  projectId: string;
  sku: string;
}

export interface ScopedOrderContext {
  projectId: string;
  items: ScopedItem[];
}

export type AddItemDecision =
  | { ok: true; item: ScopedItem }
  | { ok: false; reason: "sku_not_in_project" }
  | { ok: false; reason: "cross_project_item"; itemProjectId: string };

/**
 * Validate whether a given SKU may be added to an order. Given the
 * order's project and the candidate item, decides whether the scope
 * holds. The dual rejection modes make the cause of failure unambiguous
 * for the UI.
 */
export function canAddItemToOrder(
  order: Pick<ScopedOrderContext, "projectId">,
  candidate: ScopedItem | undefined,
): AddItemDecision {
  if (!candidate) return { ok: false, reason: "sku_not_in_project" };
  if (candidate.projectId !== order.projectId) {
    return {
      ok: false,
      reason: "cross_project_item",
      itemProjectId: candidate.projectId,
    };
  }
  return { ok: true, item: candidate };
}

/**
 * Find a project's item by SKU. Returns undefined instead of the
 * first match across projects, guaranteeing the lookup is always
 * scoped — the caller can't accidentally pick up a same-named SKU
 * from a different project.
 */
export function findProjectItem(
  items: ScopedItem[],
  projectId: string,
  sku: string,
): ScopedItem | undefined {
  return items.find((i) => i.projectId === projectId && i.sku === sku);
}

/**
 * Check whether deleting a project is safe. The rule is: a project may
 * be deleted only if it has zero orders attached. This mirrors the
 * DB-level ON DELETE RESTRICT on orders.project_id and lets the UI
 * surface a helpful confirmation before the round-trip.
 */
export function canDeleteProject(orderCount: number): boolean {
  return orderCount === 0;
}
