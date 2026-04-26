import { AsyncLocalStorage } from "node:async_hooks";
import type { ObservabilityContext } from "@/lib/observability/types";

const storage = new AsyncLocalStorage<ObservabilityContext>();

export function getObservabilityContext(): ObservabilityContext | undefined {
  return storage.getStore();
}

export function runWithObservabilityContext<T>(
  ctx: ObservabilityContext,
  fn: () => T,
): T;
export function runWithObservabilityContext<T>(
  ctx: ObservabilityContext,
  fn: () => Promise<T>,
): Promise<T>;
export function runWithObservabilityContext<T>(
  ctx: ObservabilityContext,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  return storage.run(ctx, fn);
}
