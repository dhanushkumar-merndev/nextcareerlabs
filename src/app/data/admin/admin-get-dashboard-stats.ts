import "server-only";
import { prisma } from "@/lib/db";
import { requireAdmin } from "./require-admin";
import {
  getCache,
  setCache,
  GLOBAL_CACHE_KEYS,
  getGlobalVersion,
  incrementGlobalVersion,
} from "@/lib/redis";

export async function adminGetDashboardStats(clientVersion?: string) {
  await requireAdmin();

  const currentVersion = await getGlobalVersion(
    GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS_VERSION,
  );

  if (clientVersion && clientVersion === currentVersion) {
    console.log(
      `%c[adminGetDashboardStats] SERVER HIT: NOT_MODIFIED (${clientVersion}).`,
      "color: #eab308; font-weight: bold",
    );
    return { status: "not-modified", version: currentVersion };
  }

  if (!clientVersion) {
    console.log(
      `[adminGetDashboardStats] SSR Request (Client: None). Returning full data for Prop.`,
    );
  } else {
    console.log(
      `[adminGetDashboardStats] Background Sync (Client: ${clientVersion}, Server: ${currentVersion}) for key "${GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS_VERSION}". Checking Redis...`,
    );
  }

  const cacheKey = GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS;
  const redisStartTime = Date.now();
  const cached = await getCache<any>(cacheKey);
  const redisDuration = Date.now() - redisStartTime;

  if (cached) {
    console.log(
      `%c[adminGetDashboardStats] REDIS HIT (${redisDuration}ms). Version: ${currentVersion}`,
      "color: #eab308; font-weight: bold",
    );
    return { data: cached, version: currentVersion };
  }

  console.log(
    `[adminGetDashboardStats] Redis Cache MISS. Fetching from Prisma DB...`,
  );
  const startTime = Date.now();

  const [totalUsers, totalSubscriptions, totalCourses, totalLessons] =
    await Promise.all([
      prisma.user.count(),
      prisma.enrollment.count({ where: { status: "Granted" } }),
      prisma.course.count(),
      prisma.lesson.count(),
    ]);

  const duration = Date.now() - startTime;
  console.log(
    `%c[adminGetDashboardStats] DB HIT (${duration}ms).`,
    "color: #eab308; font-weight: bold",
  );

  const stats = {
    totalUsers,
    totalSubscriptions,
    totalCourses,
    totalLessons,
  };

  // Cache for 30 days (effective forever)
  await setCache(cacheKey, stats, 2592000);

  return {
    data: stats,
    version: currentVersion,
  };
}
