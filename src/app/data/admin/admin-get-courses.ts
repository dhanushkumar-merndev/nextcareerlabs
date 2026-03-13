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
  getOrSetWithStampedePrevention,
  checkRateLimit,
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

  const { version: currentVersion, data: cached } = searchQuery
    ? { version: await getGlobalVersion(versionKey), data: null }
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
    // 🛡️ Native Database Pagination for search (Search results are ephemeral)
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

    // ✅ Post-process: Normalize search results (Hours -> Seconds)
    const normalizedPage = page.map((c: any) => ({
      ...c,
      duration: (c.duration || 0) * 3600,
    }));

    return {
      data: {
        courses: normalizedPage,
        nextCursor,
        total: -1,
      },
      version: currentVersion,
    };
  } else if (cached && Array.isArray(cached)) {
    console.log(
      `[adminGetCourses] 🔵 Redis HIT. Auth: ${authDuration}ms, Redis: ${redisDuration}ms`,
    );
    allCourses = cached;
  } else {
    console.log(
      `[adminGetCourses] 🗄️ Redis MISS. Fetching courses with stampede prevention...`,
    );
    
    allCourses = await getOrSetWithStampedePrevention(
      cacheKey,
      async () => {
        const dbStartTime = Date.now();
        const dbRaw = await prisma.course.findMany({
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

        // ✅ Post-process: Normalize all durations to seconds (Hours -> Seconds)
        const normalized = dbRaw.map((c: any) => ({
          ...c,
          duration: (c.duration || 0) * 3600,
        }));

        console.log(
          `[adminGetCourses] 🗄️ DB Fetch took ${Date.now() - dbStartTime}ms`,
        );
        return normalized;
      },
      2592000, // 30 days
    );
  }

  // ── Slicing Logic (Shared for HIT and fresh MISS) ─────────────────
  const idx = cursor ? allCourses.findIndex((c: any) => c.id === cursor) : -1;
  const startIndex = cursor && idx === -1 ? allCourses.length : idx + 1;

  const page = allCourses.slice(startIndex, startIndex + PAGE_SIZE);
  const nextCursor =
    startIndex + PAGE_SIZE < allCourses.length
      ? (page[page.length - 1]?.id ?? null)
      : null;

  return {
    data: {
      courses: page,
      nextCursor,
      total: allCourses.length,
    },
    version: currentVersion,
  };
}

export type AdminCourseType = any;
