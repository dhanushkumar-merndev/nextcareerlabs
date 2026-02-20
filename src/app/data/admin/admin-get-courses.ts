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

  if (searchQuery) {
    if (cached) {
      console.log(`[adminGetCourses] Redis Cache filter for "${searchQuery}"...`);
      const q = searchQuery.toLowerCase();
      allCourses = cached.filter(c => 
        c.title.toLowerCase().includes(q) || 
        (c.smallDescription?.toLowerCase().includes(q)) ||
        c.slug.toLowerCase().includes(q)
      );
    } else {
      console.log(`[adminGetCourses] Searching DB for "${searchQuery}"...`);
      const startTime = Date.now();
      allCourses = await prisma.course.findMany({
        where: {
          OR: [
            { title: { contains: searchQuery, mode: 'insensitive' } },
            { smallDescription: { contains: searchQuery, mode: 'insensitive' } },
            { slug: { contains: searchQuery, mode: 'insensitive' } }
          ]
        },
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
      const duration = Date.now() - startTime;
      console.log(`[adminGetCourses] DB Search took ${duration}ms.`);
    }
  } else if (cached) {
    console.log(`[adminGetCourses] Redis Cache HIT. Preparing page...`);
    
    // Smart Sync: If no search/cursor, return first page immediately from Redis
    if (!cursor) {
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
    const startTime = Date.now();
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
    const duration = Date.now() - startTime;
    console.log(`[adminGetCourses] DB Fetch took ${duration}ms.`);

    // Cache in Redis for 30 days (effective forever)
    await setCache(cacheKey, allCourses, 2592000);
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
