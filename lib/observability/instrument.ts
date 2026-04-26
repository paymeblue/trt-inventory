import type { NextRequest } from "next/server";
import { runWithObservabilityContext } from "@/lib/observability/context";
import {
  getLogger,
  observabilityContextFromHeaders,
} from "@/lib/observability/logger";

/**
 * Wraps a Route Handler so every log line inside shares the same
 * `requestId` / `traceparent`, and emits one structured `http.request`
 * line per invocation (duration + status).
 */
export function instrumentRouteHandler<P = Record<string, string>>(
  routeKey: string,
  handler: (
    req: NextRequest,
    ctx?: { params: Promise<P> },
  ) => Promise<Response>,
): (req: NextRequest, ctx?: { params: Promise<P> }) => Promise<Response> {
  return async (req, ctx) => {
    const obs = observabilityContextFromHeaders(req.headers);
    return runWithObservabilityContext(obs, async () => {
      const log = getLogger();
      const t0 = performance.now();
      try {
        const res = await handler(req, ctx);
        log.info("http.request", {
          route: routeKey,
          method: req.method,
          path: req.nextUrl.pathname,
          status: res.status,
          duration_ms: Math.round(performance.now() - t0),
        });
        return res;
      } catch (err) {
        log.error("http.request.exception", {
          route: routeKey,
          method: req.method,
          path: req.nextUrl.pathname,
          duration_ms: Math.round(performance.now() - t0),
          err,
        });
        throw err;
      }
    });
  };
}

/**
 * Server Components / server actions: bind the same context ALS uses so
 * nested services (e.g. `executeScan` → domain events) pick up requestId.
 */
export function runPageWithObservability<T>(
  headersList: Headers,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  const obs = observabilityContextFromHeaders(headersList);
  return runWithObservabilityContext(obs, fn);
}
