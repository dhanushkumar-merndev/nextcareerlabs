/**
 * POST /api/auth/provider-check
 *
 * Determines the appropriate authentication provider for a user
 * based on their email address.
 *
 * Logic:
 * - New user → allow Email OTP login
 * - Existing user with Google account → enforce Google login
 * - Existing user without Google → allow Email OTP login
 * - Banned user → block access entirely
 */

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    // Parse request body
    const { email } = await req.json();

    // Validate email input
    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Fetch minimal user data (lean query)
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        banned: true,
        accounts: {
          select: { providerId: true },
        },
      },
    });

    // New user → allow email OTP flow
    if (!user) {
      return NextResponse.json({ provider: "email" });
    }

    // Banned user → block access
    if (user.banned) {
      return NextResponse.json({
        provider: "banned",
        message:
          "You have been banned from this application. Please contact support",
      });
    }

    // Check if Google provider is linked
    const hasGoogle = user.accounts.some(
      acc => acc.providerId === "google"
    );

    // Decide auth provider
    return NextResponse.json({
      provider: hasGoogle ? "google" : "email",
    });
  } catch (error) {
    // Fallback error response
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
