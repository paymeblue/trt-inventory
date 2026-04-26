import { NextRequest, NextResponse } from "next/server";
import { verifySessionHandoff } from "@/lib/auth-handoff";
import { isSafeInternalRedirectPath } from "@/lib/auth-routing";
import { getSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t");
  const next = req.nextUrl.searchParams.get("next");
  if (!token || !next || !isSafeInternalRedirectPath(next)) {
    return new NextResponse("Invalid sign-in link.", { status: 400 });
  }
  const payload = verifySessionHandoff(token);
  if (!payload) {
    return new NextResponse(
      "This sign-in link has expired. Sign in with your email and password, then scan again.",
      { status: 401 },
    );
  }
  const session = await getSession();
  session.userId = payload.userId;
  session.email = payload.email;
  session.role = payload.role;
  session.name = payload.name;
  await session.save();
  return NextResponse.redirect(new URL(next, req.nextUrl.origin));
}
