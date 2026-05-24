import "server-only";
import { prisma } from "@/lib/db";
import { requireAdmin } from "./require-admin";
import {
  getCache,
  setCache,
  GLOBAL_CACHE_KEYS,
  getGlobalVersion,
} from "@/lib/redis";

export async function adminGetRecentCourses(clientVersion?: string) {
  await requireAdmin();

  const currentVersion = await getGlobalVersion(
    GLOBAL_CACHE_KEYS.ADMIN_RECENT_COURSES_VERSION,
  );

  if (clientVersion && clientVersion === currentVersion) {
    if (process.env.NODE_ENV === "development") {
      console.log(
        `%c[adminGetRecentCourses] SERVER HIT: NOT_MODIFIED (${clientVersion}).`,
        "color: #eab308; font-weight: bold",
      );
    }
    return { status: "not-modified", version: currentVersion };
  }

  if (!clientVersion) {
    if (process.env.NODE_ENV === "development") {
      console.log(
        `[adminGetRecentCourses] SSR Request (Client: None). Returning full data for Prop.`,
      );
    }
  } else {
    if (process.env.NODE_ENV === "development") {
      console.log(
        `[adminGetRecentCourses] Background Sync (Client: ${clientVersion}, Server: ${currentVersion}) for key "${GLOBAL_CACHE_KEYS.ADMIN_RECENT_COURSES_VERSION}". Checking Redis...`,
      );
    }
  }

  const cacheKey = `${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:recent_courses`;
  const redisStartTime = Date.now();
  const cached = await getCache<unknown>(cacheKey);
  const redisDuration = Date.now() - redisStartTime;

  if (cached) {
    if (process.env.NODE_ENV === "development") {
      console.log(
        `%c[adminGetRecentCourses] REDIS HIT (${redisDuration}ms). Version: ${currentVersion}`,
        "color: #eab308; font-weight: bold",
      );
    }
    return { data: cached, version: currentVersion };
  }

  if (process.env.NODE_ENV === "development") {
    console.log(
      `[adminGetRecentCourses] Redis Cache MISS. Fetching from Prisma DB...`,
    );
  }
  const startTime = Date.now();
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
  const duration = Date.now() - startTime;
  if (process.env.NODE_ENV === "development") {
    console.log(
      `%c[adminGetRecentCourses] DB HIT (${duration}ms).`,
      "color: #eab308; font-weight: bold",
    );
  }

  // Cache for 6 hours
  await setCache(cacheKey, data, 2592000); // 30 days

  return {
    data: data,
    version: currentVersion,
  };
}
