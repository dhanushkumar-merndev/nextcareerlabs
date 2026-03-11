import "server-only";
import { prisma } from "@/lib/db";
import { requireAdmin } from "./require-admin";
import {
  getCache,
  setCache,
  GLOBAL_CACHE_KEYS,
  getGlobalVersion,
  incrementGlobalVersion,
  getLatestVersionAndCache,
} from "@/lib/redis";

const PAGE_SIZE = 9;

export async function adminGetCourses(
  clientVersion?: string,
  cursor?: string | null,
  searchQuery?: string,
) {
  const authStartTime = Date.now();
  await requireAdmin();
  const authDuration = Date.now() - authStartTime;

  const redisStartTime = Date.now();
  const versionKey = GLOBAL_CACHE_KEYS.ADMIN_COURSES_VERSION;
  const cacheKey = GLOBAL_CACHE_KEYS.ADMIN_COURSES_LIST;

  const { version: currentVersion, data: cached } =
    searchQuery || cursor
      ? { version: await getGlobalVersion(versionKey), data: null } // Skip cache for search/pagination for now to keep it simple, or we could fetch version independently
      : await getLatestVersionAndCache<any[]>(versionKey, cacheKey);
  const redisDuration = Date.now() - redisStartTime;

  // Smart Sync ONLY for first page and no search
  if (
    !searchQuery &&
    !cursor &&
    clientVersion &&
    clientVersion === currentVersion
  ) {
    console.log(
      `[adminGetCourses] ✨ Smart Sync Match (v${clientVersion}). Auth: ${authDuration}ms, Redis: ${redisDuration}ms`,
    );
    return { status: "not-modified", version: currentVersion };
  }

  let allCourses: any[];

  if (searchQuery) {
    console.log(
      `[adminGetCourses] 🔍 Search mode: "${searchQuery}". Auth: ${authDuration}ms`,
    );
    const dbStartTime = Date.now();
    // 🛡️ Native Database Pagination for search
    const courses = await prisma.course.findMany({
      where: {
        OR: [
          { title: { contains: searchQuery, mode: "insensitive" } },
          { smallDescription: { contains: searchQuery, mode: "insensitive" } },
          { slug: { contains: searchQuery, mode: "insensitive" } },
        ],
      },
      take: PAGE_SIZE + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      orderBy: { createdAt: "desc" },
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

    const hasNextPage = courses.length > PAGE_SIZE;
    const page = hasNextPage ? courses.slice(0, PAGE_SIZE) : courses;
    const nextCursor = hasNextPage ? page[page.length - 1].id : null;

    console.log(
      `[adminGetCourses] DB Search took ${Date.now() - dbStartTime}ms.`,
    );

    return {
      data: {
        courses: page,
        nextCursor,
        total: -1, // Total is expensive for large paginated search, returning -1
      },
      version: currentVersion,
    };
  } else if (cached && Array.isArray(cached)) {
    console.log(
      `[adminGetCourses] 🔵 Redis HIT. Auth: ${authDuration}ms, Redis: ${redisDuration}ms`,
    );

    // If we have cached the ENTIRE list (which we do for small/medium sets),
    // we can still slice from memory to save a DB hit, but for 1M users we'd change this
    const startIndex = cursor
      ? cached.findIndex((c: any) => c.id === cursor) + 1
      : 0;
    const page = cached.slice(startIndex, startIndex + PAGE_SIZE);
    const nextCursor =
      startIndex + PAGE_SIZE < cached.length ? page[page.length - 1].id : null;

    return {
      data: {
        courses: page,
        nextCursor,
        total: cached.length,
      },
      version: currentVersion,
    };
  } else {
    console.log(`[adminGetCourses] 🗄️ Redis MISS. Fetching page from DB...`);
    const dbStartTime = Date.now();

    // 🛡️ Native Database Pagination
    const courses = await prisma.course.findMany({
      take: PAGE_SIZE + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      orderBy: { createdAt: "desc" },
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

    const hasNextPage = courses.length > PAGE_SIZE;
    const page = hasNextPage ? courses.slice(0, PAGE_SIZE) : courses;
    const nextCursor = hasNextPage ? page[page.length - 1].id : null;

    console.log(
      `[adminGetCourses] DB Fetch took ${Date.now() - dbStartTime}ms.`,
    );

    return {
      data: {
        courses: page,
        nextCursor,
        total: -1,
      },
      version: currentVersion,
    };
  }
}

export type AdminCourseType = any;
