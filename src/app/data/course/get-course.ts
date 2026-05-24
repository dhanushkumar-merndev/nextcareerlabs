import "server-only";
import { prisma } from "@/lib/db";
import { cache } from "react";
import {
  getCache,
  setCache,
  GLOBAL_CACHE_KEYS,
  getVersions,
} from "@/lib/redis";

export async function getIndividualCourse(
  slug: string,
  clientVersion?: string,
  userId?: string,
) {
  const versionKeys = [GLOBAL_CACHE_KEYS.SLUG_VERSION(slug)];
  if (userId) versionKeys.push(GLOBAL_CACHE_KEYS.USER_VERSION(userId));

  const [slugV, userV = ""] = await getVersions(versionKeys);
  const currentVersion = userId ? `${slugV}:${userV}` : slugV;

  // Smart Sync: If client has the latest version, don't re-fetch
  if (clientVersion && clientVersion === currentVersion) {
    if (process.env.NODE_ENV === "development") {
      console.log(
        `[getIndividualCourse] Version match for ${slug}. Returning NOT_MODIFIED.`,
      );
    }
    return { status: "not-modified", version: currentVersion };
  }

  // Check Redis cache for this specific course (versioned to skip stale data)
  const cacheKey = `${GLOBAL_CACHE_KEYS.COURSE_DETAIL(slug)}:${currentVersion}`;
  const startTime = Date.now();
  const cached = await getCache<unknown>(cacheKey);

  if (cached) {
    if (process.env.NODE_ENV === "development") {
      console.log(`[Redis] Cache HIT for course: ${slug} (v${currentVersion})`);
    }
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
      isFree: true,
      freeChaptersCount: true,
      price: true,
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

  const courseData = course
    ? { ...course, price: course.price ? Number(course.price) : null }
    : null;

  const dbDuration = Date.now() - startTime;

  if (slugV === "0") {
    // First visit — initialize version so subsequent requests hit Redis
    const realVersion = Date.now().toString();
    await setCache(GLOBAL_CACHE_KEYS.SLUG_VERSION(slug), realVersion);
    const realKey = `${GLOBAL_CACHE_KEYS.COURSE_DETAIL(slug)}:${realVersion}`;
    await setCache(realKey, courseData, 2592000);
    if (process.env.NODE_ENV === "development") {
      console.log(`[getIndividualCourse] DB first fetch for ${slug} — version initialized to ${realVersion} (${dbDuration}ms)`);
    }
    return { course: courseData, version: realVersion };
  }

  if (process.env.NODE_ENV === "development") {
    console.log(`[getIndividualCourse] DB Computation took ${dbDuration}ms`);
  }

  // Cache in Redis for 30 days
  await setCache(cacheKey, courseData, 2592000);

  return { course: courseData, version: currentVersion };
}

export const getAllPublishedCourses = cache(async () => {
  const t0 = Date.now();
  const cacheKey = GLOBAL_CACHE_KEYS.PUBLISHED_COURSES_LIST;
  const cached = await getCache<{ id: string; title: string; slug: string }[]>(cacheKey);
  if (cached) {
    if (process.env.NODE_ENV === "development") {
      console.log(`[getAllPublishedCourses] Redis HIT (${Date.now() - t0}ms)`);
    }
    return cached;
  }

  const result = await prisma.course.findMany({
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
  if (process.env.NODE_ENV === "development") {
    console.log(`[getAllPublishedCourses] DB Query took ${Date.now() - t0}ms`);
  }

  await setCache(cacheKey, result, 2592000); // 30 days
  return result;
});
