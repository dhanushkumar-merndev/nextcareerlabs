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

  // ✅ Optimization: Concurrent fetching of lesson and enrollment
  const [lesson, enrollment] = await Promise.all([
    prisma.lesson.findUnique({
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
        spriteKey: true,
        spriteCols: true,
        spriteRows: true,
        spriteInterval: true,
        spriteWidth: true,
        spriteHeight: true,
        lessonProgress: {
          where: {
            userId: session.id,
          },
          select: {
            completed: true,
            quizPassed: true,
            lessonId: true,
            lastWatched: true,
            actualWatchTime: true,
          },
        },
        transcription: {
          select: {
            vttUrl: true,
          }
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
    }),
    prisma.enrollment.findFirst({
        where: {
            userId: session.id,
            Course: {
                chapter: {
                    some: {
                        lesson: {
                            some: {
                                id: lessonId
                            }
                        }
                    }
                }
            }
        },
        select: { status: true }
    })
  ]);

  if (!lesson || !enrollment || enrollment.status !== "Granted") {
    return notFound();
  }

  const result = { lesson };

  // Cache in Redis for 6 hours
  await setCache(cacheKey, result, 21600);

  return { ...result, version: currentVersion };
}

export type LessonContentType = Awaited<ReturnType<typeof getLessonContent>>;
