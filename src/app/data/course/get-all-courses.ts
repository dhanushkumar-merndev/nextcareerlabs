import "server-only";
import { prisma } from "@/lib/db";
import { getCache, setCache, GLOBAL_CACHE_KEYS, getGlobalVersion } from "@/lib/redis";

export async function getAllCourses(clientVersion?: string, userId?: string) {
  const currentVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION);
  
  // Smart Sync: If client has the latest version, don't re-fetch
  if (clientVersion && clientVersion === currentVersion) {
    console.log(`[getAllCourses] Version match (${currentVersion}). Returning NOT_MODIFIED.`);
    return { status: "not-modified", version: currentVersion };
  }

  // Check Redis cache
  const cacheKey = GLOBAL_CACHE_KEYS.COURSES_LIST;
  const cached = await getCache<any>(cacheKey);
  let courses = cached;

  if (!courses) {
    console.log(`[Redis] Cache MISS for courses list`);
    courses = await prisma.course.findMany({
      where: {
        status: "Published",
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        title: true,
        smallDescription: true,
        duration: true,
        level: true,
        fileKey: true,
        category: true,
        slug: true,
        id: true,
      },
    });

    // Cache in Redis for 6 hours
    await setCache(cacheKey, courses, 21600);
  } else {
    console.log(`[Redis] Cache HIT for courses list`);
  }

  // If userId is provided, fetch their enrollment statuses
  if (userId) {
    const enrollments = await prisma.enrollment.findMany({
      where: { userId: userId },
      select: { courseId: true, status: true }
    });
    
    const enrollmentMap = new Map(enrollments.map(e => [e.courseId, e.status]));
    
    const coursesWithEnrollment = courses.map((c: any) => ({
      ...c,
      enrollmentStatus: enrollmentMap.get(c.id) || null
    }));
    
    return { courses: coursesWithEnrollment, version: currentVersion };
  }
  
  return { courses, version: currentVersion };
}

type FullResult = Awaited<ReturnType<typeof getAllCourses>>;
// If it's a "not-modified" response, it won't have .courses
// So we extract the course type from the success state
export type PublicCourseType = Extract<FullResult, { courses: any }>["courses"][0];
