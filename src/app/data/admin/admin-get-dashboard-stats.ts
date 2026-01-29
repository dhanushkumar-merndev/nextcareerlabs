import "server-only";
import { prisma } from "@/lib/db";
import { requireAdmin } from "./require-admin";
import { getCache, setCache, GLOBAL_CACHE_KEYS, getGlobalVersion } from "@/lib/redis";

export async function adminGetDashboardStats(clientVersion?: string) {
  await requireAdmin();
  const currentVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION);

  if (clientVersion && clientVersion === currentVersion) {
    return { status: "not-modified", version: currentVersion };
  }

  const cacheKey = GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS;
  const cached = await getCache<any>(cacheKey);

  if (cached && !clientVersion) {
     return { stats: cached, version: currentVersion };
  }

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

  const stats = {
    totalUsers,
    enrolledUsers,
    totalCourses,
    totalLessons,
  };

  // Cache for 1 hour
  await setCache(cacheKey, stats, 3600);

  return {
    stats,
    version: currentVersion,
  };
}
