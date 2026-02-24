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
  
  // 1. Fetch Lesson Core Data
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
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
        where: { userId: session.id },
        select: {
          completed: true,
          quizPassed: true,
          lessonId: true,
          lastWatched: true,
          actualWatchTime: true,
        },
      },
      transcription: {
        select: { vttUrl: true }
      },
      Chapter: {
        select: {
          courseId: true,
          Course: {
            select: { slug: true },
          },
        },
      },
    },
  });

  if (!lesson) return notFound();

  // 2. Optimized Enrollment + MCQs (Concurrent)
  const [enrollment, questions] = await Promise.all([
    prisma.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId: session.id,
          courseId: lesson.Chapter.courseId
        }
      },
      select: { status: true }
    }),
    prisma.question.findMany({
      where: { lessonId },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        question: true,
        options: true,
        correctIdx: true,
        explanation: true,
        order: true,
      }
    })
  ]);

  console.log(`%c[Lesson] 🗄️  DB COMPUTE done in ${Date.now() - dbStart}ms`, "color: #f97316");

  if (!enrollment || enrollment.status !== "Granted") {
    return notFound();
  }

  const result = { lesson, questions };

  // ── Cache in Redis: 30 min hot TTL (1800s) ──────────────────────
  await setCache(cacheKey, result, 1800);
  console.log(`%c[Lesson] 💾 CACHED in Redis (30 min) → lesson:${lessonId}`, "color: #8b5cf6");

  return { ...result, version: currentVersion };
}

export type LessonContentType = Awaited<ReturnType<typeof getLessonContent>>;
