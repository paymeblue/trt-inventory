import { describe, expect, it } from "vitest";
import { computeProgress, resolveScan } from "@/lib/scan";
import {
  classifyNetworkError,
  classifyScanResponse,
  type ScanCallResult,
} from "@/lib/scan-client";
import { checkRole } from "@/lib/auth-guard";
import type { OrderStatus } from "@/db/schema";

/**
 * This suite stitches together the pure building blocks used by the real
 * scan flow — the resolver, the progress reducer, the transport classifier,
 * and the auth guard — so we can exercise an end-to-end "PM creates, then
 * installer fulfils" story without a database. It's the most realistic
 * coverage we can get in a unit-test runner, and it's the first thing to
 * break if anyone regresses the lifecycle.
 */

type Item = {
  id: string;
  productId: string;
  barcode: string;
  scannedAt: Date | null;
};

type Product = { sku: string; stockQuantity: number };

/**
 * Mirrors what `/api/orders/[id]/scan` does server-side, minus the DB:
 *  1. Check the installer is authenticated (401/403).
 *  2. Reject scans on an already-fulfilled order.
 *  3. Resolve the scan.
 *  4. On valid, decrement the matching warehouse stock by 1.
 *  5. Roll status forward (fulfilled / anomaly) when appropriate.
 */
function simulateServerScan({
  barcode,
  actor,
  order,
  warehouse,
}: {
  barcode: string;
  actor: Parameters<typeof checkRole>[0];
  order: { status: OrderStatus; items: Item[] };
  warehouse: Map<string, Product>;
}): {
  response: { ok: boolean; status: number; body: Record<string, unknown> };
  nextOrder: { status: OrderStatus; items: Item[] };
  nextWarehouse: Map<string, Product>;
} {
  // 1. auth
  const auth = checkRole(actor, "installer");
  if (!auth.ok) {
    return {
      response: {
        ok: false,
        status: auth.status,
        body: {
          error:
            auth.status === 401
              ? "Not authenticated"
              : "This action requires the installer role",
        },
      },
      nextOrder: order,
      nextWarehouse: warehouse,
    };
  }

  // 2. order already done?
  if (order.status === "fulfilled") {
    return {
      response: {
        ok: false,
        status: 400,
        body: { error: "Order is already fully fulfilled" },
      },
      nextOrder: order,
      nextWarehouse: warehouse,
    };
  }

  // 3. resolve
  const result = resolveScan({
    barcode,
    items: order.items,
    orderStatus: order.status,
  });

  let items = order.items;
  let wh = warehouse;
  let stockPayload: { sku: string; stockQuantity: number } | undefined;

  const outcome = result.outcome;
  if (outcome.result === "valid") {
    const matchedId = outcome.itemId;
    const matched = order.items.find((i) => i.id === matchedId)!;

    // 4. warehouse decrement (mirrors the 409 the server now returns when
    //    the product was deleted mid-flight).
    const product = wh.get(matched.productId);
    if (!product) {
      return {
        response: {
          ok: false,
          status: 409,
          body: {
            error: `Warehouse SKU "${matched.productId}" no longer exists. Recreate it or rebuild the order.`,
          },
        },
        nextOrder: order,
        nextWarehouse: warehouse,
      };
    }
    const decremented = { ...product, stockQuantity: product.stockQuantity - 1 };
    wh = new Map(wh);
    wh.set(matched.productId, decremented);
    stockPayload = {
      sku: decremented.sku,
      stockQuantity: decremented.stockQuantity,
    };

    // mark scanned
    items = items.map((i) =>
      i.id === matched.id ? { ...i, scannedAt: new Date() } : i,
    );
  }

  const status: OrderStatus = result.nextStatus ?? order.status;

  return {
    response: {
      ok: true,
      status: 200,
      body: {
        outcome: result.outcome,
        ...(stockPayload ? { stock: stockPayload } : {}),
      },
    },
    nextOrder: { status, items },
    nextWarehouse: wh,
  };
}

/** Mirrors what the installer UI does with a response. */
function clientHandle(resp: {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
}): ScanCallResult {
  return classifyScanResponse(
    { ok: resp.ok, status: resp.status },
    resp.body as never,
  );
}

describe("fulfilment flow — happy path", () => {
  it("a 3-item order walks active -> active -> fulfilled and decrements stock 3x", () => {
    const installer = {
      userId: "u-1",
      email: "i@x.com",
      role: "installer" as const,
      name: "Inst",
    };
    let order = {
      status: "active" as OrderStatus,
      items: [
        { id: "1", productId: "SKU-A", barcode: "TRT-A", scannedAt: null },
        { id: "2", productId: "SKU-B", barcode: "TRT-B", scannedAt: null },
        { id: "3", productId: "SKU-A", barcode: "TRT-A2", scannedAt: null },
      ] as Item[],
    };
    let warehouse = new Map<string, Product>([
      ["SKU-A", { sku: "SKU-A", stockQuantity: 10 }],
      ["SKU-B", { sku: "SKU-B", stockQuantity: 4 }],
    ]);

    const statuses: OrderStatus[] = [order.status];
    for (const barcode of ["TRT-A", "TRT-B", "TRT-A2"]) {
      const step = simulateServerScan({
        barcode,
        actor: installer,
        order,
        warehouse,
      });
      expect(step.response.ok).toBe(true);
      order = step.nextOrder;
      warehouse = step.nextWarehouse;
      statuses.push(order.status);
    }

    expect(statuses).toEqual(["active", "active", "active", "fulfilled"]);
    expect(warehouse.get("SKU-A")!.stockQuantity).toBe(8); // 10 - 2
    expect(warehouse.get("SKU-B")!.stockQuantity).toBe(3); // 4 - 1
    expect(computeProgress(order.items)).toEqual({
      total: 3,
      scanned: 3,
      remaining: 0,
      percent: 100,
    });
  });
});

describe("fulfilment flow — auth gating", () => {
  const pm = {
    userId: "u-pm",
    email: "pm@x.com",
    role: "pm" as const,
    name: "PM",
  };

  const initialOrder = {
    status: "active" as OrderStatus,
    items: [
      { id: "1", productId: "SKU-A", barcode: "TRT-A", scannedAt: null },
    ] as Item[],
  };
  const initialWarehouse = new Map<string, Product>([
    ["SKU-A", { sku: "SKU-A", stockQuantity: 5 }],
  ]);

  it("an unauthenticated request is rejected 401 and changes NOTHING", () => {
    const step = simulateServerScan({
      barcode: "TRT-A",
      actor: null,
      order: initialOrder,
      warehouse: initialWarehouse,
    });
    expect(step.response.status).toBe(401);
    expect(step.nextOrder).toEqual(initialOrder);
    expect(step.nextWarehouse.get("SKU-A")!.stockQuantity).toBe(5);

    // And the client treats it as auth, not invalid.
    const classified = clientHandle(step.response);
    expect(classified.kind).toBe("auth");
  });

  it("a PM hitting the installer-only scan endpoint gets 403 and no stock decrement", () => {
    const step = simulateServerScan({
      barcode: "TRT-A",
      actor: pm,
      order: initialOrder,
      warehouse: initialWarehouse,
    });
    expect(step.response.status).toBe(403);
    expect(step.nextOrder).toEqual(initialOrder);
    expect(step.nextWarehouse.get("SKU-A")!.stockQuantity).toBe(5);

    const classified = clientHandle(step.response);
    expect(classified.kind).toBe("auth");
  });
});

describe("fulfilment flow — duplicate & invalid outcomes don't touch stock", () => {
  const installer = {
    userId: "u-1",
    email: "i@x.com",
    role: "installer" as const,
    name: "Inst",
  };

  it("duplicate scan: stock unchanged, order status unchanged", () => {
    let order = {
      status: "active" as OrderStatus,
      items: [
        { id: "1", productId: "SKU-A", barcode: "TRT-A", scannedAt: new Date() },
        { id: "2", productId: "SKU-B", barcode: "TRT-B", scannedAt: null },
      ] as Item[],
    };
    let warehouse = new Map<string, Product>([
      ["SKU-A", { sku: "SKU-A", stockQuantity: 5 }],
      ["SKU-B", { sku: "SKU-B", stockQuantity: 5 }],
    ]);

    const step = simulateServerScan({
      barcode: "TRT-A", // already scanned
      actor: installer,
      order,
      warehouse,
    });
    expect(step.response.ok).toBe(true);
    expect((step.response.body.outcome as { result: string }).result).toBe(
      "duplicate",
    );
    expect(step.response.body.stock).toBeUndefined();

    order = step.nextOrder;
    warehouse = step.nextWarehouse;
    expect(order.status).toBe("active");
    expect(warehouse.get("SKU-A")!.stockQuantity).toBe(5);
    expect(warehouse.get("SKU-B")!.stockQuantity).toBe(5);
  });

  it("invalid scan: stock unchanged, status flips to anomaly", () => {
    let order = {
      status: "active" as OrderStatus,
      items: [
        { id: "1", productId: "SKU-A", barcode: "TRT-A", scannedAt: null },
      ] as Item[],
    };
    let warehouse = new Map<string, Product>([
      ["SKU-A", { sku: "SKU-A", stockQuantity: 5 }],
    ]);

    const step = simulateServerScan({
      barcode: "TRT-NOPE",
      actor: installer,
      order,
      warehouse,
    });
    expect(step.response.ok).toBe(true);
    expect((step.response.body.outcome as { result: string }).result).toBe(
      "invalid",
    );
    order = step.nextOrder;
    warehouse = step.nextWarehouse;
    expect(order.status).toBe("anomaly");
    expect(warehouse.get("SKU-A")!.stockQuantity).toBe(5);
  });
});

describe("fulfilment flow — already fulfilled", () => {
  it("blocks further scans on a fulfilled order with 400", () => {
    const installer = {
      userId: "u-1",
      email: "i@x.com",
      role: "installer" as const,
      name: "Inst",
    };
    const order = {
      status: "fulfilled" as OrderStatus,
      items: [
        { id: "1", productId: "SKU-A", barcode: "TRT-A", scannedAt: new Date() },
      ] as Item[],
    };
    const warehouse = new Map<string, Product>([
      ["SKU-A", { sku: "SKU-A", stockQuantity: 5 }],
    ]);

    const step = simulateServerScan({
      barcode: "TRT-A",
      actor: installer,
      order,
      warehouse,
    });
    expect(step.response.ok).toBe(false);
    expect(step.response.status).toBe(400);
    expect(step.nextWarehouse.get("SKU-A")!.stockQuantity).toBe(5);
  });
});

describe("fulfilment flow — warehouse SKU deleted mid-order", () => {
  it("fails loud with 409 and does not mark the item as scanned", () => {
    const installer = {
      userId: "u-1",
      email: "i@x.com",
      role: "installer" as const,
      name: "Inst",
    };
    const order = {
      status: "active" as OrderStatus,
      items: [
        { id: "1", productId: "SKU-GONE", barcode: "TRT-A", scannedAt: null },
      ] as Item[],
    };
    const warehouse = new Map<string, Product>(); // empty on purpose

    const step = simulateServerScan({
      barcode: "TRT-A",
      actor: installer,
      order,
      warehouse,
    });
    expect(step.response.status).toBe(409);
    expect(step.nextOrder.items[0].scannedAt).toBeNull();

    // Client classifies 409 as 'conflict' — NOT invalid, NOT server error.
    const classified = clientHandle(step.response);
    expect(classified.kind).toBe("conflict");
  });
});

describe("fulfilment flow — transport failures (client classification)", () => {
  it("a network error surfaces as 'network' — never as invalid scan", () => {
    const r = classifyNetworkError(new TypeError("Failed to fetch"));
    expect(r.kind).toBe("network");
  });

  it("a 5xx surfaces as 'server' with the status preserved", () => {
    const r = classifyScanResponse(
      { ok: false, status: 503 },
      { error: "upstream down" },
    );
    expect(r.kind).toBe("server");
    if (r.kind === "server") {
      expect(r.status).toBe(503);
      expect(r.message).toBe("upstream down");
    }
  });
});

describe("fulfilment flow — realistic mixed sequence", () => {
  it("four scans: valid, invalid (anomaly), duplicate, valid -> fulfilled", () => {
    const installer = {
      userId: "u-1",
      email: "i@x.com",
      role: "installer" as const,
      name: "Inst",
    };
    let order = {
      status: "active" as OrderStatus,
      items: [
        { id: "1", productId: "SKU-A", barcode: "TRT-A", scannedAt: null },
        { id: "2", productId: "SKU-B", barcode: "TRT-B", scannedAt: null },
      ] as Item[],
    };
    let warehouse = new Map<string, Product>([
      ["SKU-A", { sku: "SKU-A", stockQuantity: 3 }],
      ["SKU-B", { sku: "SKU-B", stockQuantity: 3 }],
    ]);

    const scans = ["TRT-A", "TRT-ZZZ", "TRT-A", "TRT-B"];
    const outcomes: string[] = [];
    const statuses: OrderStatus[] = [order.status];

    for (const barcode of scans) {
      const step = simulateServerScan({
        barcode,
        actor: installer,
        order,
        warehouse,
      });
      expect(step.response.ok).toBe(true);
      outcomes.push(
        (step.response.body.outcome as { result: string }).result,
      );
      order = step.nextOrder;
      warehouse = step.nextWarehouse;
      statuses.push(order.status);
    }

    expect(outcomes).toEqual(["valid", "invalid", "duplicate", "valid"]);
    expect(statuses).toEqual(["active", "active", "anomaly", "anomaly", "fulfilled"]);
    // Only 2 valid scans -> only 2 stock decrements.
    expect(warehouse.get("SKU-A")!.stockQuantity).toBe(2);
    expect(warehouse.get("SKU-B")!.stockQuantity).toBe(2);
  });
});
