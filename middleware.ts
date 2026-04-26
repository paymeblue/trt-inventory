import { NextResponse, type NextRequest } from "next/server";
import { decideAuthRouting } from "@/lib/auth-routing";
import {
  REQUEST_ID_HEADER,
  isValidRequestId,
  readTraceparent,
} from "@/lib/observability/request-id";

function getOrCreateRequestId(req: NextRequest): string {
  const incoming =
    req.headers.get(REQUEST_ID_HEADER) ??
    req.headers.get("X-Request-Id") ??
    req.headers.get("X-Request-ID");
  if (incoming && isValidRequestId(incoming)) return incoming;
  return crypto.randomUUID();
}

function withRequestIdHeaders(
  req: NextRequest,
  requestId: string,
  traceparent: string | undefined,
) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  if (traceparent) {
    requestHeaders.set("traceparent", traceparent);
  }
  return requestHeaders;
}

function mirrorOnResponse(res: NextResponse, requestId: string) {
  res.headers.set(REQUEST_ID_HEADER, requestId);
  return res;
}

export function middleware(req: NextRequest) {
  const requestId = getOrCreateRequestId(req);
  const traceparent = readTraceparent(req.headers);
  const requestHeaders = withRequestIdHeaders(req, requestId, traceparent);

  const { pathname, search } = req.nextUrl;
  const hasSession = req.cookies.has("trt.session");
  const redirectParam = req.nextUrl.searchParams.get("redirect");

  const decision = decideAuthRouting({
    pathname,
    search,
    hasSession,
    redirectParam,
  });

  switch (decision.kind) {
    case "next":
      return mirrorOnResponse(
        NextResponse.next({ request: { headers: requestHeaders } }),
        requestId,
      );
    case "unauthenticated-json":
      return mirrorOnResponse(
        NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
        requestId,
      );
    case "redirect": {
      const url = req.nextUrl.clone();
      url.pathname = decision.pathname;
      url.search = decision.search ?? "";
      return mirrorOnResponse(NextResponse.redirect(url), requestId);
    }
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
