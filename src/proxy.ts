import { env } from "@/lib/env";
import arcjet, { createMiddleware, detectBot } from "@arcjet/next";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { AuthSession } from "./lib/types/auth";
import { clearOtherSessionsOnce } from "./lib/session-cleanup";

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

  // 3. Determine if we NEED a session check in middleware
  const isProtectedRoute = path.startsWith("/dashboard") || path.startsWith("/admin");
  const isSpecialRoute = path === "/api/auth/error" || path === "/banned";
  
  // 🔥 SMART SYNC optimization: Skip DB lookup for public pages (Homepage, Courses, etc.)
  // The client-side useSmartSession will handle the UI state without blocking the server response here.
  if (!isProtectedRoute && !isSpecialRoute) {
    return NextResponse.next();
  }

  // 4. Perform session lookup ONLY for protected/special routes
  const session = await auth.api.getSession({
    headers: request.headers,
  }) as AuthSession | null;

  if (session?.user.banned && path !== "/banned") {
    return NextResponse.redirect(new URL("/banned", request.url));
  }

  if (session) {
    try {
      await clearOtherSessionsOnce(session.user.id, session.session.id);
    } catch (e) {
      console.error("Session cleanup failed:", e);
    }
  }

  // 5. Protected route enforcement
  if (path.startsWith("/dashboard") && !session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (path.startsWith("/admin")) {
    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (session.user.role !== "admin") {
      return NextResponse.redirect(new URL("/not-admin", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|api/auth).*)"],
};

export default createMiddleware(aj, mainMiddleware);
