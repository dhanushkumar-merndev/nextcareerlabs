import "server-only";
import { prisma } from "@/lib/db";
import {
  getCache,
  setCache,
  GLOBAL_CACHE_KEYS,
  getGlobalVersion,
} from "@/lib/redis";
import { CoursesServerResult } from "@/lib/types/course";

type RedisCoursesCache = {
  data: any[];
  version: string;
};

export async function getAllCourses(
  clientVersion?: string,
  userId?: string
): Promise<CoursesServerResult> {
  const currentVersion = await getGlobalVersion(
    GLOBAL_CACHE_KEYS.COURSES_VERSION
  );

  /**
   * 1️⃣ Smart version sync
   * If client already has latest data, stop here
   */
  if (clientVersion && clientVersion === currentVersion) {
    return {
      status: "not-modified",
      version: currentVersion,
    };
  }

  /**
   * 2️⃣ Redis cache (6 hours)
   */
  const cacheKey = GLOBAL_CACHE_KEYS.COURSES_LIST;

  const cached = await getCache<RedisCoursesCache>(cacheKey);

  let courses = cached?.data;

  /**
   * 3️⃣ DB fallback (only if Redis miss)
   */
  if (!courses) {
    courses = await prisma.course.findMany({
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
      {
        data: courses,
        version: currentVersion,
      },
      6 * 60 * 60 // 6 hours
    );
  }

  /**
   * 4️⃣ Merge enrollment status (user-specific, NEVER cached)
   */
  if (userId) {
    const enrollments = await prisma.enrollment.findMany({
      where: { userId },
      select: { courseId: true, status: true },
    });

    const enrollmentMap = new Map(
      enrollments.map(e => [e.courseId, e.status])
    );

    courses = courses.map(course => ({
      ...course,
      enrollmentStatus: enrollmentMap.get(course.id) ?? null,
    }));
  }

  /**
   * 5️⃣ Final response
   */
  return {
    status: "data",
    version: currentVersion,
    courses,
  };
}
