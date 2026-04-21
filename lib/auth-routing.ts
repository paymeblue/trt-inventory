/**
 * Pure routing decision for the request middleware. Kept framework-free so
 * the rules can be unit-tested without constructing a NextRequest.
 *
 * Invariants:
 *  - A valid-looking session cookie visiting /login is bounced to home (or
 *    the requested redirect target) so the sign-in form never renders
 *    inside the authenticated app shell.
 *  - Public auth endpoints and Next internals always pass through.
 *  - Unauthenticated API calls return 401 JSON (not an HTML redirect).
 *  - Unauthenticated page navigations redirect to /login, preserving the
 *    originally requested path in ?redirect=… so we can bounce back.
 */

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
];

export type AuthRoutingInput = {
  pathname: string;
  search: string;
  hasSession: boolean;
  redirectParam: string | null;
};

export type AuthRoutingDecision =
  | { kind: "next" }
  | { kind: "unauthenticated-json" }
  | { kind: "redirect"; pathname: string; search?: string };

export function decideAuthRouting(input: AuthRoutingInput): AuthRoutingDecision {
  const { pathname, search, hasSession, redirectParam } = input;

  if (hasSession && pathname === "/login") {
    const target = isSafeInternalPath(redirectParam) ? redirectParam : "/";
    return { kind: "redirect", pathname: target, search: "" };
  }

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    isPublicPath(pathname)
  ) {
    return { kind: "next" };
  }

  if (hasSession) return { kind: "next" };

  if (pathname.startsWith("/api/")) {
    return { kind: "unauthenticated-json" };
  }

  const returnTo = pathname + (search ?? "");
  return {
    kind: "redirect",
    pathname: "/login",
    search: `?redirect=${encodeURIComponent(returnTo)}`,
  };
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function isSafeInternalPath(value: string | null): value is string {
  // Guard against open-redirects: only accept same-origin absolute paths
  // (must start with "/" and not with "//" which would be protocol-relative).
  return !!value && value.startsWith("/") && !value.startsWith("//");
}
