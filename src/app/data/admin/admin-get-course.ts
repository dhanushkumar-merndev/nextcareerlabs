import "server-only";
import { requireAdmin } from "./require-admin";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";

import { getCache, setCache, GLOBAL_CACHE_KEYS, getGlobalVersion } from "@/lib/redis";

export type CourseData = {
  id: string;
  title: string;
  smallDescription: string | null;
  duration: number | null;
  level: string | null;
  status: string;
  fileKey: string | null;
  category: string;
  slug: string;
  description: string | null;
  chapter: {
    id: string;
    title: string;
    position: number;
    lesson: {
      id: string;
      title: string;
      description: string | null;
      thumbnailKey: string | null;
      position: number;
      videoKey: string | null;
    }[];
  }[];
};

export async function adminGetCourse(id: string, clientVersion?: string) {
  await requireAdmin();

  let currentVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_COURSES_VERSION);

  // Smart Sync
  if (clientVersion && clientVersion === currentVersion) {
    console.log(`[adminGetCourse] Version Match (${clientVersion}). Returning NOT_MODIFIED.`);
    return { status: "not-modified", version: currentVersion };
  }

  // Check Redis cache
  const cacheKey = GLOBAL_CACHE_KEYS.COURSE_DETAIL_BY_ID(id);
  const cached = await getCache<CourseData>(cacheKey);

  if (cached) {
    console.log(`[adminGetCourse] Redis Cache HIT for ID: ${id}`);
    return {
      data: cached,
      version: currentVersion,
      source: "REDIS"
    };
  }

  console.log(`[adminGetCourse] Redis Cache MISS. Fetching from Prisma DB...`);
  const startTime = Date.now();
  const data = await prisma.course.findUnique({
    where: {
      id: id,
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
      description: true,
      chapter: {
        select: {
          id: true,
          title: true,
          position: true,
          lesson: {
            select: {
              id: true,
              title: true,
              description: true,
              thumbnailKey: true,
              position: true,
              videoKey: true,
            },
          },
        },
      },
    },
  }) as CourseData | null;
  const duration = Date.now() - startTime;
  console.log(`[adminGetCourse] DB Fetch took ${duration}ms for ID: ${id}`);

  if (!data) {
    return notFound();
  }

  // Cache in Redis for 30 days
  await setCache(cacheKey, data, 2592000);

  return {
    data: data,
    version: currentVersion,
    source: "DB",
    computeTime: duration
  };
}

export type AdminCourseSingularData = CourseData;

export type AdminCourseSingularType = Awaited<
  ReturnType<typeof adminGetCourse>
>;
