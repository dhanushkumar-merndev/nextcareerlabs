"use server";
import { requireUser } from "../user/require-user";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import {
  getCache,
  setCache,
  GLOBAL_CACHE_KEYS,
  getGlobalVersion,
} from "@/lib/redis";

export async function getLessonContent(
  lessonId: string,
  clientVersion?: string,
) {
  const session = await requireUser();

  // ✅ Parallel version reads instead of sequential
  const [coursesVersion, userVersion] = await Promise.all([
    getGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION),
    getGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(session.id)),
  ]);
  const currentVersion = `${coursesVersion}_${userVersion}`;

  // Smart Sync – version match means client local cache is fresh
  if (clientVersion && clientVersion === currentVersion) {
    console.log(
      `[Lesson] ✅ VERSION MATCH → NOT_MODIFIED (v${currentVersion})`,
    );
    return { status: "not-modified", version: currentVersion };
  }

  // ── Tier 2: Redis ─────────────────────────────────────────────────
  const cacheKey = `user:lesson:${session.id}:${lessonId}:${currentVersion}`;
  const redisStartTime = Date.now();
  const cached = await getCache<any>(cacheKey);
  console.log(
    `[Lesson] Redis cache lookup took ${Date.now() - redisStartTime}ms. Result: ${cached ? "HIT" : "MISS"}`,
  );
  if (cached) {
    return { ...cached, version: currentVersion };
  }

  // ── Tier 3: Database ──────────────────────────────────────────────
  console.log(`[Lesson] 🗄️  DB COMPUTE → lesson:${lessonId}`);
  const dbStart = Date.now();

  // ✅ Parallel: lesson fetch first, then enrollment + MCQs concurrently
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
      lowResKey: true,
      lessonProgress: {
        where: { userId: session.id },
        select: {
          completed: true,
          quizPassed: true,
          lessonId: true,
          lastWatched: true,
          actualWatchTime: true,
          restrictionTime: true,
        },
      },
      transcription: {
        select: { vttUrl: true },
      },
      Chapter: {
        select: {
          courseId: true,
          Course: {
            select: {
              slug: true,
              title: true,
            },
          },
        },
      },
    },
  });

  if (!lesson) return notFound();

  const [enrollment, questions] = await Promise.all([
    prisma.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId: session.id,
          courseId: lesson.Chapter.courseId,
        },
      },
      select: { status: true },
    }),
    prisma.question.findMany({
      where: { lessonId },
      orderBy: { order: "asc" },
      select: {
        id: true,
        question: true,
        options: true,
        order: true,
        // ✅ Include feedback ONLY if they passed, for the review screen
        ...(lesson?.lessonProgress?.[0]?.quizPassed
          ? { correctIdx: true, explanation: true }
          : {}),
      },
    }),
  ]);

  console.log(`[Lesson] 🗄️  DB COMPUTE done in ${Date.now() - dbStart}ms`);

  if (!enrollment || enrollment.status !== "Granted") {
    return notFound();
  }

  const result = { lesson, questions };

  // ✅ Don't await cache write — let it happen in background
  setCache(cacheKey, result, 2592000).catch(console.error);
  console.log(`[Lesson] 💾 CACHED in Redis (30 min) → lesson:${lessonId}`);

  return { ...result, version: currentVersion };
}

export type LessonContentType = Awaited<ReturnType<typeof getLessonContent>>;
