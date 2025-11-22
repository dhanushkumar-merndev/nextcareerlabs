import { env } from "@/lib/env";
import arcjet, { createMiddleware, detectBot } from "@arcjet/next";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const aj = arcjet({
  key: env.ARCJET_KEY!,
  rules: [
    detectBot({
      mode: "LIVE",
      allow: ["CATEGORY:SEARCH_ENGINE"], // allow Google/Bing only
    }),
  ],
});

async function adminMiddleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Always allow Better Auth endpoints
  if (path.startsWith("/api/auth")) return NextResponse.next();

  // If route is NOT /admin/** → allow for everyone INCLUDING admin
  if (!path.startsWith("/admin")) return NextResponse.next();

  // --- /admin/** protection starts here ---

  const session = await auth.api.getSession({
    headers: request.headers,
  });

  // Unauthenticated → login
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Logged in but not admin → block
  if (session.user.role !== "admin") {
    return NextResponse.redirect(new URL("/not-admin", request.url));
  }

  // Admin → allow
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|api/auth).*)"],
};

export default createMiddleware(aj, async (request: NextRequest) => {
  return adminMiddleware(request);
});
