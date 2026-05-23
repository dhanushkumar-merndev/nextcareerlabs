/**
 * POST /api/auth/provider-check
 *
 * Determines the appropriate authentication provider for a user.
 * Returns a consistent response to prevent email enumeration.
 */

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/redis";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 },
      );
    }

    // Rate limit: 5 checks per IP per minute
    const rl = await checkRateLimit(
      `provider-check:ip`,
      5,
      60,
    );
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests. Try again shortly." },
        { status: 429 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        banned: true,
        accounts: {
          select: { providerId: true },
        },
      },
    });

    if (user?.banned) {
      return NextResponse.json(
        { error: "Account unavailable" },
        { status: 403 },
      );
    }

    // Always return "email" to prevent enumeration.
    // If the user has Google, the actual Google login flow
    // will handle the redirect on the auth page.
    return NextResponse.json({ provider: "email" });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
