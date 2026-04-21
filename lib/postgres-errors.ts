/** Postgres SQLSTATE for unique_violation */
export const PG_UNIQUE_VIOLATION = "23505";

export type PostgresErrorMeta = {
  code?: string;
  constraint?: string;
};

/**
 * Best-effort extraction of Postgres error fields from `postgres` / `pg`
 * driver errors (shape varies slightly by driver version).
 */
export function getPostgresErrorMeta(err: unknown): PostgresErrorMeta {
  if (typeof err !== "object" || err === null) return {};
  const o = err as Record<string, unknown>;
  const code = typeof o.code === "string" ? o.code : undefined;
  let constraint: string | undefined;
  if (typeof o.constraint_name === "string") constraint = o.constraint_name;
  else if (typeof o.constraint === "string") constraint = o.constraint;
  return { code, constraint };
}

export function isUniqueViolation(err: unknown): boolean {
  return getPostgresErrorMeta(err).code === PG_UNIQUE_VIOLATION;
}

export function uniqueViolationUserMessage(constraint?: string): string {
  const c = constraint ?? "";
  if (c === "projects_name_unique" || c.includes("projects_name"))
    return "A project with this name already exists.";
  if (c === "products_project_sku_unique" || c.includes("products_project_sku"))
    return "This project already has an item with that SKU.";
  return "This record conflicts with an existing one (duplicate name or SKU).";
}
