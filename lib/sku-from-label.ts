/**
 * Derive a short SKU base slug from a human-readable label, then allocate
 * sequential numeric suffixes (tu-op-001, tu-op-002) without collisions.
 */

const MAX_BASE_LEN = 24;

/** Lowercase letters, digits, hyphen only. */
export function normalizeSkuToken(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

/**
 * Maps a label like "Top Upper Unit" to a compact base such as `tu-un`.
 * Not guaranteed to match every informal abbreviation preference; the PM can
 * still edit the SKU before saving.
 */
export function skuBaseFromLabel(label: string): string {
  const cleaned = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ");
  const words = cleaned.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return "item";
  if (words.length === 1) {
    const w = words[0]!;
    return w.length <= 4 ? w : `${w.slice(0, 2)}-${w.slice(2, 4)}`.slice(0, MAX_BASE_LEN);
  }
  if (words.length === 2) {
    const [a, b] = words;
    return `${a!.slice(0, 2)}-${b!.slice(0, 2)}`.slice(0, MAX_BASE_LEN);
  }
  const a = words[0]!;
  const b = words[1]!;
  const c = words[2]!;
  return `${a[0] ?? "x"}${b[0] ?? "x"}-${c.slice(0, 2)}`.slice(0, MAX_BASE_LEN);
}

export function formatSkuSequence(base: string, index: number): string {
  const b = normalizeSkuToken(base) || "item";
  const n = Math.min(Math.max(index, 1), 999);
  return `${b}-${String(n).padStart(3, "0")}`;
}

/** Next free index for `base` given existing full SKUs (e.g. tu-un-001). */
export function nextSkuIndexForBase(
  base: string,
  existingFullSkus: Iterable<string>,
): number {
  const prefix = `${normalizeSkuToken(base)}-`;
  let max = 0;
  for (const sku of existingFullSkus) {
    const s = sku.trim().toLowerCase();
    if (!s.startsWith(prefix)) continue;
    const tail = s.slice(prefix.length);
    const num = /^\d{1,3}$/.test(tail) ? Number.parseInt(tail, 10) : 0;
    if (num > max) max = num;
  }
  return max + 1;
}

/**
 * Fills SKU for rows where `skuDirty` is not set, using sequential codes per
 * name base. Respects manually edited SKUs via `skuDirty: true`.
 */
export function reassignAutoSkus<
  T extends { sku: string; name: string; skuDirty?: boolean },
>(rows: T[]): T[] {
  const taken = new Set<string>();
  for (const r of rows) {
    if (r.skuDirty && r.sku.trim()) taken.add(r.sku.trim().toLowerCase());
  }

  return rows.map((row) => {
    if (row.skuDirty) return row;
    if (!row.name.trim()) return { ...row, sku: "" };
    const base = skuBaseFromLabel(row.name);
    let idx = nextSkuIndexForBase(base, taken);
    let sku = formatSkuSequence(base, idx);
    while (taken.has(sku.toLowerCase())) {
      idx += 1;
      sku = formatSkuSequence(base, idx);
    }
    taken.add(sku.toLowerCase());
    return { ...row, sku };
  });
}
