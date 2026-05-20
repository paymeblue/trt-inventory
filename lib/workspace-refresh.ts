/** Lets order scans refresh SWR-backed dashboard stats without React Query there. */
const listeners = new Set<() => void>();

export function onWorkspaceOrdersChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitWorkspaceOrdersChanged(): void {
  for (const listener of listeners) {
    listener();
  }
}
