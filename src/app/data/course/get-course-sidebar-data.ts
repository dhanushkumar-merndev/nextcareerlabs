"use server"
import { requireUser } from "../user/require-user";
import { prisma } from "@/lib/db";
import { notFound, redirect } from "next/navigation";

import { getCache, setCache, GLOBAL_CACHE_KEYS, getGlobalVersion } from "@/lib/redis";

export async function getCourseSidebarData(slug: string, clientVersion?: string) {
  const session = await requireUser();
  const coursesVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION);
  const userVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(session.id));
  const currentVersion = `${coursesVersion}_${userVersion}`;

  // Smart Sync
  if (clientVersion && clientVersion === currentVersion) {
    console.log(`[getCourseSidebarData] Version match for ${slug}. Returning NOT_MODIFIED.`);
    return { status: "not-modified", version: currentVersion };
  }

  // Check Redis cache (versioned)
  const cacheKey = `user:sidebar:${session.id}:${slug}:${currentVersion}`;
  const cached = await getCache<any>(cacheKey);
  if (cached) {
    console.log(`[Redis] Cache HIT for sidebar: ${session.id}:${slug} (v${currentVersion})`);
    return { ...cached, version: currentVersion };
  }

  const course = await prisma.course.findUnique({
    where: {
      slug: slug,
    },
    select: {
      id: true,
      title: true,
      fileKey: true,
      duration: true,
      level: true,
      category: true,
      slug: true,
      chapter: {
        orderBy: {
          position: "asc",
        },
        select: {
          title: true,
          id: true,
          position: true,
          lesson: {
            orderBy: {
              position: "asc",
            },
            select: {
              id: true,
              title: true,
              position: true,
              description: true,
              thumbnailKey: true,
              lessonProgress: {
                where: {
                  userId: session.id,
                },
                select: {
                  completed: true,
                  quizPassed: true,
                  lessonId: true,
                  id: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!course) {
    return notFound();
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: {
      userId_courseId: {
        userId: session.id,
        courseId: course.id,
      },
    },
  });

  if (!enrollment || enrollment.status !== "Granted") {
    return notFound();
  }

  const result = { course };
  
  // Cache in Redis for 6 hours
  await setCache(cacheKey, result, 2592000); // 30 days

  return { ...result, version: currentVersion };
}

export type CourseSidebarDataType = Awaited<
  ReturnType<typeof getCourseSidebarData>
>;
