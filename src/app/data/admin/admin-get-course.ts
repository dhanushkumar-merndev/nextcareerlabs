import "server-only";
import { requireAdmin } from "./require-admin";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";

import {
  getCache,
  setCache,
  GLOBAL_CACHE_KEYS,
  getGlobalVersion,
  getLatestVersionAndCache,
} from "@/lib/redis";

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
  const authStartTime = Date.now();

  // Parallelize auth and cache fetch for maximum speed
  const cacheKey = GLOBAL_CACHE_KEYS.COURSE_DETAIL_BY_ID(id);
  const versionKey = GLOBAL_CACHE_KEYS.ADMIN_COURSES_VERSION;

  let redisDuration = 0;
  let authDuration = 0;

  const [_, redisResult] = await Promise.all([
    (async () => {
      const res = await requireAdmin();
      authDuration = Date.now() - authStartTime;
      return res;
    })(),
    (async () => {
      const start = Date.now();
      const res = await getLatestVersionAndCache<CourseData>(
        versionKey,
        cacheKey,
      );
      redisDuration = Date.now() - start;
      return res;
    })(),
  ]);

  const { version: currentVersion, data: cached } = redisResult;

  // Smart Sync
  if (clientVersion && clientVersion === currentVersion) {
    console.log(
      `[adminGetCourse] ✨ Smart Sync Match (v${clientVersion}). Auth: ${authDuration}ms, Redis: ${redisDuration}ms`,
    );
    return { status: "not-modified", version: currentVersion };
  }

  if (cached) {
    console.log(
      `[adminGetCourse] 🔵 Redis HIT. Auth: ${authDuration}ms, Redis: ${redisDuration}ms`,
    );
    return {
      data: cached,
      version: currentVersion,
      source: "REDIS",
    };
  }

  console.log(
    `[adminGetCourse] 🗄️ Redis MISS. Auth: ${authDuration}ms, Redis: ${redisDuration}ms. Fetching DB...`,
  );
  const dbStartTime = Date.now();
  const data = (await prisma.course.findUnique({
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
        orderBy: {
          position: "asc",
        },
        select: {
          id: true,
          title: true,
          position: true,
          lesson: {
            orderBy: {
              position: "asc",
            },
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
  })) as CourseData | null;
  const dbDuration = Date.now() - dbStartTime;
  console.log(`[adminGetCourse] DB Fetch took ${dbDuration}ms for ID: ${id}`);

  if (!data) {
    return notFound();
  }

  // Cache in Redis for 30 days (Rule Infinity)
  const cacheSetStart = Date.now();
  await setCache(cacheKey, data, 2592000);
  console.log(
    `[adminGetCourse] Redis Cache Updated. Time: ${Date.now() - cacheSetStart}ms`,
  );

  return {
    data: data,
    version: currentVersion,
    source: "DB",
    computeTime: dbDuration,
  };
}

export type AdminCourseSingularData = CourseData;

export type AdminCourseSingularType = Awaited<
  ReturnType<typeof adminGetCourse>
>;
