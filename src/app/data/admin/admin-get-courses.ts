import "server-only";
import { prisma } from "@/lib/db";
import { requireAdmin } from "./require-admin";

import { getCache, setCache, GLOBAL_CACHE_KEYS, getGlobalVersion } from "@/lib/redis";

export async function adminGetCourses(clientVersion?: string) {
  await requireAdmin();
  const currentVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION);

  // Smart Sync
  if (clientVersion && clientVersion === currentVersion) {
    console.log(`[adminGetCourses] Version match. Returning NOT_MODIFIED.`);
    return { status: "not-modified", version: currentVersion };
  }

  // Check Redis cache
  const cacheKey = "admin:courses:list";
  const cached = await getCache<any>(cacheKey);
  if (cached) {
    console.log(`[Redis] Cache HIT for admin courses list`);
    return { courses: cached, version: currentVersion };
  }

  const data = await prisma.course.findMany({
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      title: true,
      smallDescription: true,
      duration: true,
      level: true,
      status: true,
      fileKey: true,
      category: true,
      slug: true,
    },
  });

  // Cache in Redis for 6 hours
  await setCache(cacheKey, data, 21600);

  return { courses: data, version: currentVersion };
}

export type AdminCourseType = any;
