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

  
  if (path.startsWith("/api/auth")) {
    return NextResponse.next();
  }

 
  if (
    path.startsWith("/_next") ||
    path === "/favicon.ico"
  ) {
    return NextResponse.next();
  }


  const session = await auth.api.getSession({
    headers: request.headers,
  }) as AuthSession | null;

  if (path === "/banned") {
    return NextResponse.next();
  }

  if (session?.user.banned) {
    return NextResponse.redirect(new URL("/banned", request.url));
  }

  if (session) {
    await clearOtherSessionsOnce(
      session.user.id,
      session.session.id
    );
  }

 
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
  matcher: ["/((?!_next|favicon.ico).*)"],
};

export default createMiddleware(aj, mainMiddleware);
