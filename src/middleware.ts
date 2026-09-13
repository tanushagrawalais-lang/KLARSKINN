import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { isDemoMode } from "@/lib/auth/demo-mode";

const AUTH_PAGES = new Set(["/sign-in", "/sign-up"]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const demo = isDemoMode();

  if (pathname.startsWith("/companion") && !session && !demo) {
    const signIn = new URL("/sign-in", request.url);
    return NextResponse.redirect(signIn);
  }

  if (pathname.startsWith("/onboarding") && !session && !demo) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  if (session && AUTH_PAGES.has(pathname)) {
    return NextResponse.redirect(new URL("/companion", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/companion/:path*", "/onboarding", "/sign-in", "/sign-up"],
};
