import "server-only";
import { prisma } from "@/lib/db";
import { requireAdmin } from "./require-admin";
import { getCache, setCache, GLOBAL_CACHE_KEYS, getGlobalVersion, incrementGlobalVersion } from "@/lib/redis";

const PAGE_SIZE = 9;

export async function adminGetCourses(
  clientVersion?: string,
  cursor?: string | null,
  searchQuery?: string
) {
  await requireAdmin();
  let currentVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_COURSES_VERSION);

  if (currentVersion === "0") {
    console.log(`[adminGetCourses] Version key missing. Initializing...`);
    await incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_COURSES_VERSION);
    currentVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_COURSES_VERSION);
  }

  // Smart Sync ONLY for first page and no search
  if (!searchQuery && !cursor && clientVersion && clientVersion === currentVersion) {
    console.log(`[adminGetCourses] Version Match (${clientVersion}). Returning NOT_MODIFIED (Skipping Redis Data Fetch).`);
    return { status: "not-modified", version: currentVersion };
  }

  if (!searchQuery && !cursor) {
    console.log(`[adminGetCourses] Version Mismatch (Client: ${clientVersion || 'None'}, Server: ${currentVersion}). Checking Redis...`);
  }

  // Check Redis cache
  const cacheKey = GLOBAL_CACHE_KEYS.ADMIN_COURSES_LIST;
  const cached = await getCache<any[]>(cacheKey);
  
  let allCourses: any[];

  if (cached) {
    console.log(`[adminGetCourses] Redis Cache HIT. Preparing page...`);
    
    // Smart Sync: If no search/cursor, return first page immediately from Redis
    if (!searchQuery && !cursor) {
        const firstPage = cached.slice(0, PAGE_SIZE);
        const nextCursor = cached.length > PAGE_SIZE ? firstPage[firstPage.length - 1].id : null;
        
        return {
            data: {
                courses: firstPage,
                nextCursor,
                total: cached.length
            },
            version: currentVersion
        };
    }
    
    allCourses = cached;
  } else {
    console.log(`[adminGetCourses] Redis Cache MISS. Fetching from Prisma DB...`);
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
    data: {
        courses: page, 
        nextCursor,
        total: allCourses.length 
    },
    version: currentVersion, 
  };
}

export type AdminCourseType = any;
