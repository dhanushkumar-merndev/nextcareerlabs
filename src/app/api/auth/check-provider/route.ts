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

    // 🔍 Check if user exists
    const user = await prisma.user.findUnique({
      where: { email },
      include: { accounts: true },
    });

    // 🆕 New user → allow email OTP
    if (!user) {
      return NextResponse.json({ provider: "email" });
    }

    // 🔗 Check linked providers
    const providers = user.accounts.map((acc) => acc.providerId);

    if (providers.includes("google")) {
      return NextResponse.json({ provider: "google" });
    }

    // 📧 Email-based account
    return NextResponse.json({ provider: "email" });
  } catch (error) {
    console.error("check-provider error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
