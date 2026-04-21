import { NextResponse, type NextRequest } from "next/server";
import { decideAuthRouting } from "@/lib/auth-routing";

export function middleware(req: NextRequest) {
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
      return NextResponse.next();
    case "unauthenticated-json":
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    case "redirect": {
      const url = req.nextUrl.clone();
      url.pathname = decision.pathname;
      url.search = decision.search ?? "";
      return NextResponse.redirect(url);
    }
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
