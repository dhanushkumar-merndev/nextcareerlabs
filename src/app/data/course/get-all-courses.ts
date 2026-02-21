import "server-only";
import { prisma } from "@/lib/db";
import {
  getCache,
  setCache,
  GLOBAL_CACHE_KEYS,
  getGlobalVersion,
} from "@/lib/redis";
import { CoursesServerResult, PublicCourseType } from "@/lib/types/course";

const PAGE_SIZE = 9;

type RedisCoursesCache = {
  data: PublicCourseType[];
  version: string;
};

export async function getAllCourses(
  clientVersion?: string,
  userId?: string,
  cursor?: string | null,
  searchQuery?: string,
  onlyAvailable?: boolean
): Promise<CoursesServerResult> {
  let currentVersion = await getGlobalVersion(
    GLOBAL_CACHE_KEYS.COURSES_VERSION
  );

  // 🔹 If user is logged in, combine global version with user-specific version
  // This ensures enrollment status changes (like deletion or role change) trigger a sync
  if (userId) {
    const userVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(userId));
    currentVersion = `${currentVersion}:${userVersion}`;
  }



  // 🔹 Version short-circuit ONLY for first page
  if (!searchQuery && !cursor && clientVersion && clientVersion === currentVersion) {
    console.log(`[getAllCourses] Version Match (${clientVersion}). Returning NOT_MODIFIED.`);
    return { status: "not-modified", version: currentVersion };
  }

  const cacheKey = GLOBAL_CACHE_KEYS.COURSES_LIST;
  const cached = await getCache<RedisCoursesCache>(cacheKey);

  let allCourses: PublicCourseType[];
  const startTime = Date.now();

  // 🔹 If searching, bypass Redis list and query DB directly for efficiency
  if (searchQuery) {
    console.log(`[getAllCourses] SEARCH: "${searchQuery}" -> DB Query`);
    allCourses = await prisma.course.findMany({
      where: {
        status: "Published",
        OR: [
          { title: { contains: searchQuery, mode: 'insensitive' } },
          { smallDescription: { contains: searchQuery, mode: 'insensitive' } }
        ]
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        smallDescription: true,
        duration: true,
        level: true,
        fileKey: true,
        category: true,
        slug: true,
      },
    });
    console.log(`[getAllCourses] DB Search took ${Date.now() - startTime}ms`);
  } else if (cached?.data) {
    console.log(`[getAllCourses] REDIS HIT (v${cached.version})`);
    allCourses = cached.data;
  } else {
    console.log(`[getAllCourses] REDIS MISS -> DB Computation`);
    allCourses = await prisma.course.findMany({
      where: { status: "Published" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        smallDescription: true,
        duration: true,
        level: true,
        fileKey: true,
        category: true,
        slug: true,
      },
    });

    await setCache(
      cacheKey,
      { data: allCourses, version: currentVersion },
      2592000 // 30 days
    );
    console.log(`[getAllCourses] DB Computation took ${Date.now() - startTime}ms`);
  }

  // 🔹 Enrollment merge (user-specific)
  if (userId) {
    const mergeStart = Date.now();
    const enrollments = await prisma.enrollment.findMany({
      where: { userId },
      select: { courseId: true, status: true },
    });

    const map = new Map(enrollments.map((e) => [e.courseId, e.status]));

    allCourses = allCourses.map((c) => ({
      ...c,
      enrollmentStatus: map.get(c.id) ?? null,
    }));

    if (onlyAvailable) {
      allCourses = allCourses.filter((c) => !map.has(c.id));
    }
    console.log(`[getAllCourses] Enrollment Merge took ${Date.now() - mergeStart}ms`);
  }

  // 🔹 Cursor pagination (9+9)
  const startIndex = cursor
    ? allCourses.findIndex((c) => c.id === cursor) + 1
    : 0;

  const page = allCourses.slice(startIndex, startIndex + PAGE_SIZE);

  const nextCursor =
    startIndex + PAGE_SIZE < allCourses.length
      ? page[page.length - 1]?.id ?? null
      : null;

  return {
    status: "data",
    version: currentVersion,
    courses: page,
    nextCursor,
  };
}
