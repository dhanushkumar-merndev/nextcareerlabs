import "server-only";
import { prisma } from "@/lib/db";
import { requireAdmin } from "./require-admin";
import { getCache, setCache, GLOBAL_CACHE_KEYS, getGlobalVersion } from "@/lib/redis";

const PAGE_SIZE = 9;

export async function adminGetCourses(
  clientVersion?: string,
  cursor?: string | null,
  searchQuery?: string
) {
  await requireAdmin();
  const currentVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION);

  // Smart Sync ONLY for first page and no search
  if (!searchQuery && !cursor && clientVersion && clientVersion === currentVersion) {
    console.log(`[adminGetCourses] Version match. Returning NOT_MODIFIED.`);
    return { status: "not-modified", version: currentVersion };
  }

  // Check Redis cache
  const cacheKey = GLOBAL_CACHE_KEYS.ADMIN_COURSES_LIST;
  const cached = await getCache<any[]>(cacheKey);
  
  let allCourses: any[];

  if (cached) {
    console.log(`[Redis] Cache HIT for admin courses list`);
    allCourses = cached;
  } else {
    console.log(`[Redis] Cache MISS. Fetching from DB`);
    allCourses = await prisma.course.findMany({
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
    await setCache(cacheKey, allCourses, 21600);
  }

  // Filter by Search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    allCourses = allCourses.filter(c => c.title.toLowerCase().includes(q));
  }

  // Cursor Pagination
  const startIndex = cursor
    ? allCourses.findIndex(c => c.id === cursor) + 1
    : 0;

  const page = allCourses.slice(startIndex, startIndex + PAGE_SIZE);

  const nextCursor = 
    startIndex + PAGE_SIZE < allCourses.length
      ? page[page.length - 1]?.id ?? null
      : null;

  return { 
    courses: page, 
    version: currentVersion, 
    nextCursor,
    total: allCourses.length 
  };
}

export type AdminCourseType = any;
