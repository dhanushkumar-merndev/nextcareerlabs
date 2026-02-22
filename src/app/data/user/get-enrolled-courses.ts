"use server";
import { prisma } from "@/lib/db";

import { getCache, setCache, GLOBAL_CACHE_KEYS, getGlobalVersion } from "@/lib/redis";
import { requireUser } from "./require-user";

export async function getEnrolledCourses(clientVersion?: string) {
  const user = await requireUser();
  const currentVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(user.id));

  // Smart Sync
  if (clientVersion && clientVersion === currentVersion) {
    console.log(`[getEnrolledCourses] Version match for ${user.id}. Returning NOT_MODIFIED.`);
    return { status: "not-modified", version: currentVersion };
  }

  // Check Redis cache
  const cacheKey = GLOBAL_CACHE_KEYS.USER_ENROLLMENTS(user.id);
  const startTime = Date.now();
  const cached = await getCache<any>(cacheKey);
  
  if (cached) {
    console.log(`[Redis] Cache HIT for enrolled courses: ${user.id}`);
    return { enrollments: cached, version: currentVersion };
  }

  const data = await prisma.enrollment.findMany({
    where: { userId: user.id, status: "Granted" },
    select: {
      Course: {
        select: {
          id: true,
          smallDescription: true,
          title: true,
          fileKey: true,
          level: true,
          slug: true,
          duration: true,
          chapter: {
            select: {
              id: true,
              lesson: {
                select: {
                  id: true,
                  lessonProgress: {
                    where: {
                      userId: user.id,
                    },
                    select: {
                      completed: true,
                      id: true,
                      lessonId: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  console.log(`[getEnrolledCourses] DB Computation took ${Date.now() - startTime}ms`);

  // Cache in Redis for 30 days
  await setCache(cacheKey, data, 2592000); // 30 days
  
  return { enrollments: data, version: currentVersion };
}

export type EnrolledCoursesType = any;
