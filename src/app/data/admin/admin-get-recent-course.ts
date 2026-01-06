import "server-only";
import { prisma } from "@/lib/db";
import { requireAdmin } from "./require-admin";

export async function adminGetRecentCourses() {
  await requireAdmin();
  const data = await prisma.course.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: 6,
    select: {
      id: true,
      title: true,
      smallDescription: true,
      duration: true,
      level: true,
      status: true,

      fileKey: true,
      slug: true,
      category: true,
    },
  });
  return data;
}
