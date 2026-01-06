import "server-only";
import { prisma } from "@/lib/db";

export async function getAllCourses() {
  const data = await prisma.course.findMany({
    where: {
      status: "Published",
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      title: true,
      smallDescription: true,
      duration: true,
      level: true,

      fileKey: true,
      category: true,
      slug: true,
      id: true,
    },
  });
  return data;
}

export type PublicCourseType = Awaited<ReturnType<typeof getAllCourses>>[0];
