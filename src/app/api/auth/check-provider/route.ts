import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // 🔍 Lean query - only fetch what we need
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        banned: true,
        accounts: {
          select: { providerId: true },
        },
      },
    });

    // 🆕 New user → allow email OTP
    if (!user) {
      return NextResponse.json({ provider: "email" });
    }

    // 🚫 Banned user → block access
    if (user.banned) {
      return NextResponse.json({ 
        provider: "banned", 
        message: "You have been banned from this application. Please contact support" 
      });
    }

    // 🔗 Check if Google is linked
    const hasGoogle = user.accounts.some((acc) => acc.providerId === "google");

    return NextResponse.json({ provider: hasGoogle ? "google" : "email" });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
