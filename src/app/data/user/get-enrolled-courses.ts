"use server";
import { prisma } from "@/lib/db";
import { requireUser } from "./require-user";

export async function getEnrolledCourses() {
  const user = await requireUser();
  const startTime = Date.now();

  const accessRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id"
    FROM "Enrollment"
    WHERE "userId" = ${user.id}
      AND ("status" = 'Granted' OR "demoStarted" = true)
  `;
  const accessIds = accessRows.map((row) => row.id);

  const [enrollments, allProgress] = await Promise.all([
    accessIds.length > 0 ? prisma.enrollment.findMany({
      where: { id: { in: accessIds } },
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
    }) : [],
    // Flat single query for all progress
    prisma.lessonProgress.findMany({
      where: { userId: user.id },
      select: { lessonId: true, completed: true },
    }),
  ]);

  const progressMap = new Map(allProgress.map(p => [p.lessonId, p]));

  if (process.env.NODE_ENV === "development") {
    console.log(`[getEnrolledCourses] DB Computation took ${Date.now() - startTime}ms`);
  }

  return { enrollments, progressMap: Object.fromEntries(progressMap) };
}
