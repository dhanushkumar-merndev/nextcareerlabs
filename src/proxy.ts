import { env } from "@/lib/env";
import arcjet, { createMiddleware, detectBot } from "@arcjet/next";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "./lib/db";

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

  // Get session using Better Auth
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  // Clean up multiple sessions
  if (session) {
    await prisma.session.deleteMany({
      where: {
        userId: session.user.id,
        id: { not: session.session.id },
      },
    });
  }

  // Allow Better Auth internal routes
  if (path.startsWith("/api/auth")) return NextResponse.next();

  //
  // 🔐 PROTECT DASHBOARD ROUTES
  //
  if (path.startsWith("/dashboard")) {
    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  //
  // 🔐 PROTECT ADMIN ROUTES
  //
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

export default createMiddleware(aj, async (request: NextRequest) => {
  return mainMiddleware(request);
});
