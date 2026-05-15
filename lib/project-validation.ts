import { z } from "zod";

/** Legacy: one row with aggregated stock (still supported for older clients). */
export const legacyProjectItemInputSchema = z.object({
  sku: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  stockQuantity: z.number().int().min(1).default(1),
});

/** Kept as alias for create-project payloads and tests. */
export const projectItemInputSchema = legacyProjectItemInputSchema;

/**
 * Add items to a project. Either legacy one-row stock, a category batch, or a custom-named batch.
 */
export const addProjectItemsBodySchema = z
  .object({
    categoryId: z.string().uuid().optional(),
    name: z.string().trim().max(160).optional(),
    sku: z.string().trim().max(80).optional(),
    /** How many distinct physical products to insert (each starts with stock 1). */
    quantity: z.coerce.number().int().min(1).max(500).optional(),
    /** Legacy only: single row holding total on-hand stock. */
    stockQuantity: z.coerce.number().int().min(1).max(100000).optional(),
  })
  .superRefine((val, ctx) => {
    const legacySingle =
      val.stockQuantity !== undefined &&
      val.quantity === undefined &&
      !val.categoryId;
    if (legacySingle) {
      if (!val.sku?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "sku is required",
          path: ["sku"],
        });
      }
      if (!val.name?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "name is required",
          path: ["name"],
        });
      }
      return;
    }
    if (!val.categoryId && !val.name?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select a category or enter a name",
        path: ["name"],
      });
    }
  });

/** POST /api/projects body — parsed once here and in tests. */
export const createProjectBodySchema = z.object({
  name: z.string().trim().min(1, "Project name is required").max(120),
  description: z.string().trim().max(500).optional(),
  items: z
    .array(projectItemInputSchema)
    .max(200, "At most 200 items per request")
    .nullish()
    .transform((v) => v ?? []),
});

export type CreateProjectBody = z.infer<typeof createProjectBodySchema>;

/**
 * Detect duplicate SKUs in the same request payload (case-insensitive,
 * trimmed). Returns the offending SKU string from the payload for a
 * human-readable error message.
 */
export function findDuplicateSkuInPayload(items: { sku: string }[]): string | null {
  const seen = new Set<string>();
  for (const i of items) {
    const k = i.sku.trim().toLowerCase();
    if (seen.has(k)) return i.sku;
    seen.add(k);
  }
  return null;
}
