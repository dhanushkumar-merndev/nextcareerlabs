import "server-only";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { headers } from "next/headers";

export async function checkIfCourseBought(courseId: string, userId?: string) {
  let finalUserId = userId;

  if (!finalUserId) {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    finalUserId = session?.user?.id;
  }

  if (!finalUserId) return null;

  const enrollment = await prisma.enrollment.findUnique({
    where: {
      userId_courseId: {
        courseId: courseId,
        userId: finalUserId,
      },
    },
    select: {
      status: true,
    },
  });
  return enrollment?.status || null;
}

