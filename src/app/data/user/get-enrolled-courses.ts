"use server";
import { prisma } from "@/lib/db";
import { requireUser } from "./require-user";

export async function getEnrolledCourses() {
  const user = await requireUser();
  const startTime = Date.now();

  const [enrollments, allProgress] = await Promise.all([
    prisma.enrollment.findMany({
      where: { userId: user.id, status: "Granted" },
      select: {
        Course: {
          select: {
            id: true,
            smallDescription: true,
            title: true,
            fileKey: true,
            level: true,
            slug: true,
            duration: true,
            chapter: {
              select: {
                id: true,
                lesson: { select: { id: true } }, // no nested progress here
              },
            },
          },
        },
      },
    }),
    // Flat single query for all progress
    prisma.lessonProgress.findMany({
      where: { userId: user.id },
      select: { lessonId: true, completed: true },
    }),
  ]);

  const progressMap = new Map(allProgress.map(p => [p.lessonId, p]));

  console.log(`[getEnrolledCourses] DB Computation took ${Date.now() - startTime}ms`);

  return { enrollments, progressMap: Object.fromEntries(progressMap) };
}