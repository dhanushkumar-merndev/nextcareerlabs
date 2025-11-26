import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Delete all old sessions
  await prisma.session.deleteMany({
    where: {
      userId: session.user.id,
      id: { not: session.session.id },
    },
  });

  return NextResponse.json({ status: "ok" });
}
