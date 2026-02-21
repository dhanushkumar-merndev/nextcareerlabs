import { env } from "@/lib/env";
import arcjet, { createMiddleware, detectBot } from "@arcjet/next";
import { NextRequest, NextResponse } from "next/server";


const aj = arcjet({
  key: env.ARCJET_KEY!,
  rules: [
    detectBot({
      mode: "LIVE",
      allow: ["CATEGORY:SEARCH_ENGINE", "CATEGORY:MONITOR", "CATEGORY:PREVIEW"],
    }),
  ],
});

async function mainMiddleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const searchParams = request.nextUrl.searchParams;
if (path === "/api/auth/error") {
  const error = searchParams.get("error");
  

  if (error === "banned") {
    return NextResponse.redirect(new URL("/banned", request.url));
  }

  if (error === "account_not_linked") {
    const url = new URL("/", request.url);
    url.searchParams.set(
      "authError",
      "This email was registered using Email OTP. Please sign in using email instead."
    );
    return NextResponse.redirect(url);
  }

  if (error === "access_denied") {
    const url = new URL("/", request.url);
    url.searchParams.set(
      "authError",
      "Authentication failed. Please try again later."
    );
    return NextResponse.redirect(url);
  }

  return NextResponse.redirect(new URL("/", request.url));
}

  // 1. Skip middleware for simple assets
  if (path.startsWith("/_next") || path === "/favicon.ico") {
    return NextResponse.next();
  }

  // 2. Auth routes pass through
  if (path.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // 3. Simple Cookie Check for Protected Routes (Lightweight Middleware)
  const isProtectedRoute = path.startsWith("/dashboard") || path.startsWith("/admin");
  
  if (isProtectedRoute) {
    const cookieHeader = request.headers.get("cookie") || "";
    const hasSessionCookie = 
      cookieHeader.includes("better-auth.session_token") || 
      cookieHeader.includes("next-auth.session-token");

    // Fast-path redirect if clearly not logged in
    if (!hasSessionCookie) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", path);
      return NextResponse.redirect(loginUrl);
    }
  }

  // NOTE: Full session validation (Banned check, Role check) 
  // now happens inside Server Actions via `requireAdmin()` or `requireUser()`.
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|api/auth).*)"],
};

export default createMiddleware(aj, mainMiddleware);
