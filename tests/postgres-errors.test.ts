import { describe, expect, it } from "vitest";
import {
  getPostgresErrorMeta,
  isUniqueViolation,
  PG_UNIQUE_VIOLATION,
  uniqueViolationUserMessage,
} from "@/lib/postgres-errors";

describe("getPostgresErrorMeta", () => {
  it("returns empty meta for non-objects", () => {
    expect(getPostgresErrorMeta(null)).toEqual({});
    expect(getPostgresErrorMeta("x")).toEqual({});
  });

  it("reads code and constraint_name", () => {
    expect(
      getPostgresErrorMeta({
        code: PG_UNIQUE_VIOLATION,
        constraint_name: "projects_name_unique",
      }),
    ).toEqual({ code: PG_UNIQUE_VIOLATION, constraint: "projects_name_unique" });
  });

  it("falls back to constraint when constraint_name is absent", () => {
    expect(
      getPostgresErrorMeta({
        code: PG_UNIQUE_VIOLATION,
        constraint: "products_project_sku_unique",
      }),
    ).toEqual({
      code: PG_UNIQUE_VIOLATION,
      constraint: "products_project_sku_unique",
    });
  });
});

describe("isUniqueViolation", () => {
  it("is true for SQLSTATE 23505", () => {
    expect(isUniqueViolation({ code: PG_UNIQUE_VIOLATION })).toBe(true);
  });

  it("is false for other codes", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
  });
});

describe("uniqueViolationUserMessage", () => {
  it("maps projects_name_unique", () => {
    expect(uniqueViolationUserMessage("projects_name_unique")).toContain(
      "name",
    );
  });

  it("maps products_project_sku_unique", () => {
    expect(uniqueViolationUserMessage("products_project_sku_unique")).toContain(
      "SKU",
    );
  });

  it("returns a generic message for unknown constraints", () => {
    expect(uniqueViolationUserMessage("something_else")).toContain("conflicts");
  });
});
