import "server-only";
import { prisma } from "@/lib/db";
import { requireAdmin } from "./require-admin";
import { getCache, setCache, GLOBAL_CACHE_KEYS, getGlobalVersion, incrementGlobalVersion } from "@/lib/redis";

export async function adminGetDashboardStats(clientVersion?: string) {
  await requireAdmin();


  let currentVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS_VERSION);

  if (currentVersion === "0") {
    console.log(`[adminGetDashboardStats] Version key missing. Initializing...`);
    await incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS_VERSION);
    currentVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS_VERSION);
  }

  if (clientVersion && clientVersion === currentVersion) {
    console.log(`[adminGetDashboardStats] Version Match (${clientVersion}) for key "${GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS_VERSION}". Returning NOT_MODIFIED.`);
    return { status: "not-modified", version: currentVersion };
  }

  if (!clientVersion) {
    console.log(`[adminGetDashboardStats] SSR Request (Client: None). Returning full data for Prop.`);
  } else {
    console.log(`[adminGetDashboardStats] Background Sync (Client: ${clientVersion}, Server: ${currentVersion}) for key "${GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS_VERSION}". Checking Redis...`);
  }

  const cacheKey = GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS;
  const cached = await getCache<any>(cacheKey);

  if (cached) {
     console.log(`[adminGetDashboardStats] Redis Cache HIT. Returning data.`);
     return { data: cached, version: currentVersion };
  }

  console.log(`[adminGetDashboardStats] Redis Cache MISS. Fetching from Prisma DB...`);
  const startTime = Date.now();
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
  const duration = Date.now() - startTime;
  console.log(`[adminGetDashboardStats] DB Fetch took ${duration}ms.`);

  const stats = {
    totalUsers,
    enrolledUsers,
    totalCourses,
    totalLessons,
  };

  // Cache for 6 hours
  await setCache(cacheKey, stats, 21600);

  return {
    data: stats,
    version: currentVersion,
  };
}
