import "server-only";
import { prisma } from "@/lib/db";
import { requireAdmin } from "./require-admin";
import { getCache, setCache, GLOBAL_CACHE_KEYS, getGlobalVersion } from "@/lib/redis";

export async function adminGetRecentCourses(clientVersion?: string) {
  await requireAdmin();
  const currentVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION);

  if (clientVersion && clientVersion === currentVersion) {
    return { status: "not-modified", version: currentVersion };
  }

  const cacheKey = `${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:recent_courses`;
  const cached = await getCache<any[]>(cacheKey);

  if (cached) {
     console.log(`[Redis] Cache HIT for admin recent courses`);
     return { courses: cached, version: currentVersion };
  }

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

  // Cache for 1 hour
  await setCache(cacheKey, data, 3600);

  return {
    data: data,
    version: currentVersion,
  };
}
