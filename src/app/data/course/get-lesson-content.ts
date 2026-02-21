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

  // Smart Sync – version match means client local cache is fresh
  if (clientVersion && clientVersion === currentVersion) {
    console.log(`%c[Lesson] ✅ VERSION MATCH → NOT_MODIFIED (v${currentVersion})`, "color: #22c55e; font-weight: bold");
    return { status: "not-modified", version: currentVersion };
  }

  // ── Tier 2: Redis ─────────────────────────────────────────────────
  const cacheKey = `user:lesson:${session.id}:${lessonId}`;
  const cached = await getCache<any>(cacheKey);
  if (cached) {
    console.log(`%c[Lesson] 🔵 REDIS HIT → lesson:${lessonId} (v${currentVersion})`, "color: #3b82f6; font-weight: bold");
    return { ...cached, version: currentVersion };
  }

  // ── Tier 3: Database ──────────────────────────────────────────────
  console.log(`%c[Lesson] 🗄️  DB COMPUTE → lesson:${lessonId}`, "color: #f97316; font-weight: bold");
  const dbStart = Date.now();
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

  console.log(`%c[Lesson] 🗄️  DB COMPUTE done in ${Date.now() - dbStart}ms`, "color: #f97316");

  if (!lesson || !enrollment || enrollment.status !== "Granted") {
    return notFound();
  }

  const result = { lesson };

  // ── Cache in Redis: 30 min hot TTL (1800s), full data stored ──────
  await setCache(cacheKey, result, 1800); // 30 minutes Redis TTL
  console.log(`%c[Lesson] 💾 CACHED in Redis (30 min) → lesson:${lessonId}`, "color: #8b5cf6");

  return { ...result, version: currentVersion };
}

export type LessonContentType = Awaited<ReturnType<typeof getLessonContent>>;
