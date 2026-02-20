import "server-only";
import { prisma } from "@/lib/db";
import { requireAdmin } from "./require-admin";
import { getCache, setCache, GLOBAL_CACHE_KEYS, getGlobalVersion, incrementGlobalVersion } from "@/lib/redis";

export async function adminGetRecentCourses(clientVersion?: string) {
  await requireAdmin();


  let currentVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_RECENT_COURSES_VERSION);

  if (currentVersion === "0") {
    console.log(`[adminGetRecentCourses] Version key missing. Initializing...`);
    await incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_RECENT_COURSES_VERSION);
    currentVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_RECENT_COURSES_VERSION);
  }

  if (clientVersion && clientVersion === currentVersion) {
    console.log(`[adminGetRecentCourses] Version Match (${clientVersion}) for key "${GLOBAL_CACHE_KEYS.ADMIN_RECENT_COURSES_VERSION}". Returning NOT_MODIFIED.`);
    return { status: "not-modified", version: currentVersion };
  }

  if (!clientVersion) {
    console.log(`[adminGetRecentCourses] SSR Request (Client: None). Returning full data for Prop.`);
  } else {
    console.log(`[adminGetRecentCourses] Background Sync (Client: ${clientVersion}, Server: ${currentVersion}) for key "${GLOBAL_CACHE_KEYS.ADMIN_RECENT_COURSES_VERSION}". Checking Redis...`);
  }

  const cacheKey = `${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:recent_courses`;
  const cached = await getCache<any[]>(cacheKey);

  if (cached) {
     console.log(`[adminGetRecentCourses] Redis Cache HIT. Returning data.`);
     return { data: cached, version: currentVersion };
  }

  console.log(`[adminGetRecentCourses] Redis Cache MISS. Fetching from Prisma DB...`);
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
  console.log(`[adminGetRecentCourses] DB Fetch took ${duration}ms.`);

  // Cache for 6 hours
  await setCache(cacheKey, data, 21600);

  return {
    data: data,
    version: currentVersion,
  };
}
