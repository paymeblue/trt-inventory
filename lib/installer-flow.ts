import type { OrderStatus } from "@/db/schema";

/**
 * Pure resolver that turns the orders an installer can see into the
 * four-step "where am I in the job today" stepper rendered on the
 * dashboard. Lives in `lib/` so it can be unit-tested without React.
 *
 * Steps, in order:
 *   1. signed-in     — always done while a session exists.
 *   2. pick-order    — current until the installer has at least one
 *                       active order with items. If there is one, this
 *                       step links to it and is marked done.
 *   3. verify-items  — current as long as the chosen order still has
 *                       pending items; done once everything is scanned.
 *   4. resolve-order — done if the chosen order is fulfilled, or if at
 *                       least one fulfilled order exists in the recent
 *                       feed. Locked otherwise.
 *
 * The resolver picks the most recent active/anomaly order with pending
 * items as the "current order" anchor. If none exist, it falls back to
 * the most recent fulfilled order so the stepper can show a celebratory
 * end-state instead of an awkward "nothing to do" stub.
 */
export type InstallerStepId =
  | "signed-in"
  | "pick-order"
  | "verify-items"
  | "resolve-order";

export type InstallerStepStatus = "done" | "current" | "locked";

export interface InstallerOrderSnapshot {
  id: string;
  projectName: string;
  status: OrderStatus;
  total: number;
  scanned: number;
}

export interface InstallerStep {
  id: InstallerStepId;
  title: string;
  description: string;
  status: InstallerStepStatus;
  href: string | null;
  meta?: string;
}

export interface InstallerFlow {
  steps: InstallerStep[];
  currentOrder: InstallerOrderSnapshot | null;
  /** Index of the step the user should jump to when they tap "Continue". */
  currentStepIndex: number;
}

/**
 * Order to anchor the flow against. Ranks active/anomaly orders with
 * pending items first (most recently created wins), then any in-progress
 * order, then the most recent fulfilled order as a celebration target.
 */
export function pickActiveInstallerOrder(
  orders: InstallerOrderSnapshot[],
): InstallerOrderSnapshot | null {
  if (orders.length === 0) return null;

  const verifying = orders.find(
    (o) =>
      (o.status === "active" || o.status === "anomaly") &&
      o.scanned < o.total &&
      o.total > 0,
  );
  if (verifying) return verifying;

  const anyPending = orders.find(
    (o) =>
      (o.status === "active" || o.status === "anomaly") && o.scanned < o.total,
  );
  if (anyPending) return anyPending;

  const fulfilled = orders.find((o) => o.status === "fulfilled");
  if (fulfilled) return fulfilled;

  return orders[0];
}

/**
 * Step factories: each one builds a single InstallerStep from the same
 * shared context object. Splitting them out keeps `resolveInstallerFlow`
 * itself flat and lets each step's logic read top-to-bottom.
 */
interface StepCtx {
  current: InstallerOrderSnapshot | null;
  hasOrder: boolean;
  allScanned: boolean;
  anyFulfilledEver: boolean;
  orderHref: string;
}

function buildSignedInStep(): InstallerStep {
  return {
    id: "signed-in",
    title: "Signed in",
    description: "Your acknowledgements are tagged to your name.",
    status: "done",
    href: null,
  };
}

function buildPickOrderStep(ctx: StepCtx): InstallerStep {
  if (!ctx.current) {
    return {
      id: "pick-order",
      title: "Open your order",
      description: "Pick the active delivery you're working on right now.",
      status: "current",
      href: "/orders",
    };
  }
  const itemNoun = ctx.current.total === 1 ? "item" : "items";
  return {
    id: "pick-order",
    title: "Open your order",
    description: `${ctx.current.projectName} — ${ctx.current.total} ${itemNoun} to verify`,
    status: "done",
    href: ctx.orderHref,
    meta: "Tap to reopen",
  };
}

function buildVerifyItemsStep(ctx: StepCtx): InstallerStep {
  if (!ctx.current) {
    return {
      id: "verify-items",
      title: "Verify items",
      description:
        "Scan barcodes or QR codes to acknowledge each item on site.",
      status: "locked",
      href: null,
    };
  }
  if (ctx.allScanned) {
    return {
      id: "verify-items",
      title: "Verify items",
      description: "Every item on this order has been acknowledged.",
      status: "done",
      href: null,
    };
  }
  const percent = Math.round(
    (ctx.current.scanned / Math.max(1, ctx.current.total)) * 100,
  );
  return {
    id: "verify-items",
    title: "Verify items",
    description: `${ctx.current.scanned} of ${ctx.current.total} verified — keep going.`,
    status: "current",
    href: ctx.orderHref,
    meta: `${percent}%`,
  };
}

function buildResolveStep(ctx: StepCtx): InstallerStep {
  if (ctx.allScanned && ctx.current) {
    return {
      id: "resolve-order",
      title: "Order resolved",
      description: "Stock has been deducted and the order is fulfilled.",
      status: "done",
      href: `/orders/${ctx.current.id}`,
    };
  }
  if (ctx.anyFulfilledEver && !ctx.hasOrder) {
    return {
      id: "resolve-order",
      title: "Order resolved",
      description:
        "Earlier orders are fulfilled. Finish this one to unlock again.",
      status: "done",
      href: null,
    };
  }
  return {
    id: "resolve-order",
    title: "Order resolved",
    description:
      "Once every item is verified, the order is automatically fulfilled.",
    status: "locked",
    href: null,
  };
}

export function resolveInstallerFlow(
  orders: InstallerOrderSnapshot[],
): InstallerFlow {
  const current = pickActiveInstallerOrder(orders);
  const ctx: StepCtx = {
    current,
    hasOrder: !!current,
    allScanned: !!current && current.total > 0 && current.scanned >= current.total,
    anyFulfilledEver: orders.some((o) => o.status === "fulfilled"),
    orderHref: current ? `/orders/${current.id}` : "/orders",
  };

  const steps: InstallerStep[] = [
    buildSignedInStep(),
    buildPickOrderStep(ctx),
    buildVerifyItemsStep(ctx),
    buildResolveStep(ctx),
  ];

  const currentStepIndex = Math.max(
    0,
    steps.findIndex((s) => s.status === "current"),
  );

  return { steps, currentOrder: current, currentStepIndex };
}
