export const REQUEST_ID_HEADER = "x-request-id";

/** Reject junk / oversized values clients might send on x-request-id. */
export function isValidRequestId(value: string): boolean {
  if (value.length < 4 || value.length > 128) return false;
  return /^[a-zA-Z0-9\-_.]+$/.test(value);
}

export function readTraceparent(h: Headers): string | undefined {
  return h.get("traceparent") ?? h.get("Traceparent") ?? undefined;
}

/** Returns a validated inbound id, or undefined (Edge + Node safe — no crypto here). */
export function readRequestIdHeader(h: Headers): string | undefined {
  const incoming =
    h.get(REQUEST_ID_HEADER) ?? h.get("X-Request-Id") ?? h.get("X-Request-ID");
  if (incoming && isValidRequestId(incoming)) return incoming;
  return undefined;
}
