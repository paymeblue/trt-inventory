#!/usr/bin/env npx tsx
/**
 * CLI micro-benchmark for the pure scan resolver (no database).
 *
 *   npx tsx scripts/stress-scan-resolve.ts
 *   npx tsx scripts/stress-scan-resolve.ts 500000
 *
 * Use this to sanity-check CPU throughput after changes to `lib/scan.ts`.
 */
import { performance } from "node:perf_hooks";
import { computeProgress, resolveScan } from "../lib/scan";

const iterations = Math.max(
  1,
  Number.parseInt(process.argv[2] ?? "100000", 10),
);

const items = Array.from({ length: 50 }, (_, i) => ({
  id: `i${i}`,
  barcode: `B${i}`,
  scannedAt: null as Date | null,
}));

const t0 = performance.now();
for (let k = 0; k < iterations; k++) {
  resolveScan({
    barcode: `B${k % 50}`,
    items,
    orderStatus: "active",
  });
  computeProgress(items);
}
const ms = performance.now() - t0;

console.log(
  JSON.stringify({
    iterations,
    ms: Math.round(ms * 100) / 100,
    perOpUs: Math.round((ms / iterations) * 1000 * 1000) / 1000,
  }),
);
