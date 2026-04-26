import { z } from "zod";

/** One line item when creating a project or adding an item to a project. */
export const projectItemInputSchema = z.object({
  sku: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  stockQuantity: z.number().int().min(1).default(1),
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
