"use server"
import { requireUser } from "../user/require-user";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { getCache, setCache, GLOBAL_CACHE_KEYS, getGlobalVersion } from "@/lib/redis";

export async function getLessonContent(lessonId: string, clientVersion?: string) {
  const session = await requireUser();
  const coursesVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION);
  const userVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(session.id));
  const currentVersion = `${coursesVersion}_${userVersion}`;

  // Smart Sync
  if (clientVersion && clientVersion === currentVersion) {
    console.log(`[getLessonContent] Version match for ${lessonId}. Returning NOT_MODIFIED.`);
    return { status: "not-modified", version: currentVersion };
  }

  // Check Redis cache
  const cacheKey = `user:lesson:${session.id}:${lessonId}`;
  const cached = await getCache<any>(cacheKey);
  if (cached) {
    console.log(`[Redis] Cache HIT for lesson: ${session.id}:${lessonId}`);
    return { ...cached, version: currentVersion };
  }

  const lesson = await prisma.lesson.findUnique({
    where: {
      id: lessonId,
    },
    select: {
      id: true,
      title: true,
      description: true,
      thumbnailKey: true,
      videoKey: true,
      position: true,
      lessonProgress: {
        where: {
          userId: session.id,
        },
        select: {
          completed: true,
          lessonId: true,
          lastWatched: true,
          actualWatchTime: true,
        },
      },
      Chapter: {
        select: {
          courseId: true,
          Course: {
            select: {
              slug: true,
            },
          },
        },
      },
    },
  });

  if (!lesson) {
    return notFound();
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: {
      userId_courseId: {
        userId: session.id,
        courseId: lesson.Chapter.courseId,
      },
    },
    select: {
      status: true,
    },
  });

  if (!enrollment || enrollment.status !== "Granted") {
    return notFound();
  }

  const result = { lesson };

  // Cache in Redis for 6 hours
  await setCache(cacheKey, result, 21600);

  return { ...result, version: currentVersion };
}

export type LessonContentType = Awaited<ReturnType<typeof getLessonContent>>;
