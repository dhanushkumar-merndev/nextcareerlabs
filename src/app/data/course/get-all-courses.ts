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
  const currentVersion = await getGlobalVersion(
    GLOBAL_CACHE_KEYS.COURSES_VERSION
  );

  // 🔹 Version short-circuit ONLY for first page
  // WE MUST SKIP this optimization if searching, because cached version does not know about search filter
  if (!searchQuery && !cursor && clientVersion && clientVersion === currentVersion) {
    return { status: "not-modified", version: currentVersion };
  }

  const cacheKey = GLOBAL_CACHE_KEYS.COURSES_LIST;
  const cached = await getCache<RedisCoursesCache>(cacheKey);

  let allCourses: PublicCourseType[];

  // 🔹 If searching, bypass Redis list and query DB directly for efficiency
  if (searchQuery) {
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
  } else if (cached?.data) {
    // Use Redis → DB fallback for normal list
    allCourses = cached.data;
  } else {
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
      6 * 60 * 60 // 6 hours
    );
  }

  // 🔹 Enrollment merge (user-specific)
  if (userId) {
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
