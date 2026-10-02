import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const GUARDED = ["/trade", "/wallet", "/profile"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const needsAuth = GUARDED.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!needsAuth) return NextResponse.next();
  if (request.cookies.get("gold_session")?.value) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/trade/:path*", "/wallet/:path*", "/profile/:path*"],
};
