import { prisma } from "@/lib/db";
import { requireAdmin } from "./require-admin";

export async function adminGetDashboardStats() {
  await requireAdmin();
  const [totalUsers, enrolledUsers, totalCourses, totalLessons] =
    await Promise.all([
      prisma.user.count(),

      prisma.user.count({
        where: {
          enrollment: { some: {} },
        },
      }),
      prisma.course.count(),
      prisma.lesson.count(),
    ]);
  return {
    totalUsers,
    enrolledUsers,
    totalCourses,
    totalLessons,
  };
}
