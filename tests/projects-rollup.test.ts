import { describe, expect, it } from "vitest";
import {
  enrichProjectsWithRollups,
  rollupKey,
} from "@/lib/projects-rollup";

describe("enrichProjectsWithRollups", () => {
  const p1 = {
    id: "p1",
    name: "Alpha",
    description: null,
    archivedAt: null,
    createdAt: "2026-01-01",
  };
  const p2 = {
    id: "p2",
    name: "Beta",
    description: "x",
    archivedAt: null,
    createdAt: "2026-01-02",
  };

  it("zeros rollups when there are no items or orders", () => {
    const out = enrichProjectsWithRollups([p1], [], []);
    expect(out).toEqual([
      {
        ...p1,
        itemCount: 0,
        totalStock: 0,
        activeOrderCount: 0,
        fulfilledOrderCount: 0,
      },
    ]);
  });

  it("merges item counts and total stock per project", () => {
    const out = enrichProjectsWithRollups(
      [p1, p2],
      [
        { projectId: "p1", itemCount: 3, totalStock: 10 },
        { projectId: "p2", itemCount: 1, totalStock: 0 },
      ],
      [],
    );
    expect(out[0].itemCount).toBe(3);
    expect(out[0].totalStock).toBe(10);
    expect(out[1].itemCount).toBe(1);
    expect(out[1].totalStock).toBe(0);
  });

  it("only counts active and fulfilled orders (ignores draft and anomaly)", () => {
    const out = enrichProjectsWithRollups(
      [p1],
      [],
      [
        { projectId: "p1", status: "draft", orderCount: 5 },
        { projectId: "p1", status: "active", orderCount: 2 },
        { projectId: "p1", status: "fulfilled", orderCount: 7 },
        { projectId: "p1", status: "anomaly", orderCount: 1 },
      ],
    );
    expect(out[0].activeOrderCount).toBe(2);
    expect(out[0].fulfilledOrderCount).toBe(7);
  });

  it("does not leak another project's rollups into a row", () => {
    const out = enrichProjectsWithRollups(
      [p1, p2],
      [{ projectId: "p1", itemCount: 9, totalStock: 3 }],
      [{ projectId: "p2", status: "active", orderCount: 4 }],
    );
    expect(out[0]).toMatchObject({
      id: "p1",
      itemCount: 9,
      totalStock: 3,
      activeOrderCount: 0,
      fulfilledOrderCount: 0,
    });
    expect(out[1]).toMatchObject({
      id: "p2",
      itemCount: 0,
      totalStock: 0,
      activeOrderCount: 4,
      fulfilledOrderCount: 0,
    });
  });

  it("preserves project row order", () => {
    const out = enrichProjectsWithRollups(
      [p2, p1],
      [
        { projectId: "p1", itemCount: 1, totalStock: 1 },
        { projectId: "p2", itemCount: 2, totalStock: 2 },
      ],
      [],
    );
    expect(out.map((r) => r.id)).toEqual(["p2", "p1"]);
  });

  it("matches rollups when project id casing differs between queries", () => {
    const idUpper = "F658C279-5A38-4D92-80A3-5C129C657AFF";
    const idLower = "f658c279-5a38-4d92-80a3-5c129c657aff";
    expect(rollupKey(idUpper)).toBe(rollupKey(idLower));
    const out = enrichProjectsWithRollups(
      [{ ...p1, id: idUpper }],
      [{ projectId: idLower, itemCount: 3, totalStock: 11 }],
      [{ projectId: idLower, status: "fulfilled", orderCount: 1 }],
    );
    expect(out[0].itemCount).toBe(3);
    expect(out[0].totalStock).toBe(11);
    expect(out[0].fulfilledOrderCount).toBe(1);
  });

  it("coerces string / loose numeric rollup fields from the driver", () => {
    const out = enrichProjectsWithRollups(
      [p1],
      [
        {
          projectId: "p1",
          itemCount: "4" as unknown as number,
          totalStock: "9" as unknown as number,
        },
      ],
      [
        {
          projectId: "p1",
          status: "active",
          orderCount: "2" as unknown as number,
        },
      ],
    );
    expect(out[0].itemCount).toBe(4);
    expect(out[0].totalStock).toBe(9);
    expect(out[0].activeOrderCount).toBe(2);
  });
});
