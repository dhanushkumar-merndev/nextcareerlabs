import { env } from "@/lib/env";
import arcjet, { createMiddleware, detectBot } from "@arcjet/next";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
  });

 
  if (session) {
    await prisma.session.deleteMany({
      where: {
        userId: session.user.id,
        id: { not: session.session.id },
      },
    });
  }

 
  if (path.startsWith("/dashboard") && !session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  
  if (path.startsWith("/admin")) {
    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    if ((session.user as any).role !== "admin") {
      return NextResponse.redirect(new URL("/not-admin", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};

export default createMiddleware(aj, mainMiddleware);
