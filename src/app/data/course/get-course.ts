import "server-only";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { getCache, setCache, GLOBAL_CACHE_KEYS, getGlobalVersion } from "@/lib/redis";

export async function getIndividualCourse(slug: string, clientVersion?: string, userId?: string) {
  let currentVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION);

  // 🔹 If user is logged in, combine global version with user-specific version
  if (userId) {
    const userVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(userId));
    currentVersion = `${currentVersion}:${userVersion}`;
  }


  
  // Smart Sync: If client has the latest version, don't re-fetch
  if (clientVersion && clientVersion === currentVersion) {
    console.log(`[getIndividualCourse] Version match for ${slug}. Returning NOT_MODIFIED.`);
    return { status: "not-modified", version: currentVersion };
  }

  // Check Redis cache for this specific course (versioned to skip stale data)
  const cacheKey = `${GLOBAL_CACHE_KEYS.COURSE_DETAIL(slug)}:${currentVersion}`;
  const startTime = Date.now();
  const cached = await getCache<any>(cacheKey);
  
  if (cached) {
    console.log(`[Redis] Cache HIT for course: ${slug} (v${currentVersion})`);
    return { course: cached, version: currentVersion };
  }

  const course = await prisma.course.findUnique({
    where: {
      slug: slug,
    },
    select: {
      title: true,
      smallDescription: true,
      duration: true,
      level: true,
      fileKey: true,
      category: true,
      id: true,
      slug: true,
      description: true,
      chapter: {
        select: {
          title: true,
          id: true,
          lesson: {
            select: {
              id: true,
              title: true,
            },
            orderBy: {
              position: "asc",
            },
          },
        },
        orderBy: {
          position: "asc",
        },
      },
    },
  });

  console.log(`[getIndividualCourse] DB Computation took ${Date.now() - startTime}ms`);

  // Cache in Redis for 30 days
  await setCache(cacheKey, course, 2592000); // 30 days
  
  return { course, version: currentVersion };
}

export async function getAllPublishedCourses() {
  return await prisma.course.findMany({
    where: {
      status: "Published",
    },
    select: {
      id: true,
      title: true,
      slug: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
