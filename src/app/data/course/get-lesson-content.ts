"use server";
import { requireUser } from "../user/require-user";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import {
  getCache,
  setCache,
  GLOBAL_CACHE_KEYS,
  getVersions,
  getUserPendingProgress,
  withDistributedLock,
} from "@/lib/redis";

interface CachedLessonData {
  lesson: {
    id: string; title: string; description: string | null; thumbnailKey: string | null;
    videoKey: string | null; position: number; spriteKey: string | null; spriteCols: number | null;
    spriteRows: number | null; spriteInterval: number | null; spriteHeight: number | null;
    lowResKey: string | null; duration: number | null;
    lessonProgress: Array<{
      completed: boolean; quizPassed: boolean; lessonId: string;
      lastWatched: number; actualWatchTime: number; restrictionTime: number;
    }>;
    transcription: { vttUrl: string } | null;
    Chapter: {
      courseId: string;
      Course: { slug: string; title: string; isFree: boolean };
    };
  };
  questions: Array<{
    id: string; question: string; options: unknown; order: number;
    correctIdx?: number | null; explanation?: string | null;
  }>;
}

export async function getLessonContent(
  lessonId: string,
  clientVersion?: string,
) {
  const session = await requireUser();

  // ✅ Batched version reads in 1 round trip
  const [coursesVersion, userVersion] = await getVersions([
    GLOBAL_CACHE_KEYS.COURSES_VERSION,
    GLOBAL_CACHE_KEYS.USER_VERSION(session.id),
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
  const cached = await getCache<unknown>(cacheKey);
  if (cached) {
    return { ...cached, version: currentVersion };
  }

  // ── Tier 3: Database (distributed lock prevents stampedes) ─────
  console.log(`[Lesson] 🗄️  DB COMPUTE → lesson:${lessonId}`);
  const dbStart = Date.now();

  const result = await withDistributedLock<CachedLessonData>(`fetch:${cacheKey}`, async () => {
    const recheck = await getCache<CachedLessonData>(cacheKey);
    if (recheck) return recheck;

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        id: true, title: true, description: true, thumbnailKey: true,
        videoKey: true, position: true, spriteKey: true, spriteCols: true,
        spriteRows: true, spriteInterval: true, spriteHeight: true,
        lowResKey: true, duration: true,
        lessonProgress: {
          where: { userId: session.id },
          select: {
            completed: true, quizPassed: true, lessonId: true,
            lastWatched: true, actualWatchTime: true, restrictionTime: true,
          },
        },
        transcription: { select: { vttUrl: true } },
        Chapter: {
          select: {
            courseId: true,
            Course: { select: { slug: true, title: true, isFree: true } },
          },
        },
      },
    });

    if (!lesson) throw new Error("NOT_FOUND");

    const [enrollment, progress] = await Promise.all([
      prisma.enrollment.findUnique({
        where: {
          userId_courseId: {
            userId: session.id,
            courseId: lesson.Chapter.courseId,
          },
        },
        select: { status: true },
      }),
      prisma.lessonProgress.findUnique({
        where: { userId_lessonId: { userId: session.id, lessonId } },
        select: { completed: true, quizPassed: true, restrictionTime: true },
      }),
    ]);

    const isQuizPassed = progress?.quizPassed ?? false;
    const questions = await prisma.question.findMany({
      where: { lessonId },
      orderBy: { order: "asc" },
      select: {
        id: true, question: true, options: true, order: true,
        ...(isQuizPassed ? { correctIdx: true, explanation: true } : {}),
      },
    });

    console.log(`[Lesson] 🗄️  DB COMPUTE done in ${Date.now() - dbStart}ms`);

    if (!enrollment || enrollment.status !== "Granted") {
      if (lesson.Chapter.Course.isFree) {
        await prisma.enrollment.upsert({
          where: {
            userId_courseId: {
              userId: session.id,
              courseId: lesson.Chapter.courseId,
            },
          },
          update: { status: "Granted", grantedAt: new Date() },
          create: {
            userId: session.id,
            courseId: lesson.Chapter.courseId,
            status: "Granted",
            grantedAt: new Date(),
          },
        });
        const { incrementGlobalVersion, invalidateCache, invalidateUserEnrollmentCache } = await import("@/lib/redis");
        await Promise.all([
          incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION),
          incrementGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(session.id)),
          invalidateUserEnrollmentCache(session.id),
          invalidateCache(GLOBAL_CACHE_KEYS.USER_ENROLLMENTS(session.id, "latest")),
        ]);
        const cookieStore = await cookies();
        cookieStore.set("is_enrolled", "true", {
          path: "/",
          maxAge: 30 * 24 * 60 * 60,
          sameSite: "lax",
        });
        revalidatePath("/dashboard", "layout");
        revalidatePath(`/courses`);
      } else {
        throw new Error("NOT_ENROLLED");
      }
    }

    const cached = { lesson, questions };
    await setCache(cacheKey, cached, 2592000).catch(console.error);
    console.log(`[Lesson] 💾 CACHED in Redis (30 days) → lesson:${lessonId}`);
    return cached;
  });

  if (!result) {
    const recheck = await getCache<unknown>(cacheKey);
    if (recheck) return { ...recheck, version: currentVersion };
    return notFound();
  }


  // ── Tier 4: Merge Pending Redis Progress (transient, never cached) ──
  const pending = await getUserPendingProgress(session.id);
  const pendingLesson = pending[lessonId];
  if (pendingLesson) {
    console.log(
      `[Lesson] 🔄 Merging pending Redis progress for lesson:${lessonId}`,
    );
    if (result.lesson.lessonProgress[0]) {
      result.lesson.lessonProgress[0].lastWatched = pendingLesson.lastWatched;
      result.lesson.lessonProgress[0].restrictionTime = Math.max(
        result.lesson.lessonProgress[0].restrictionTime,
        pendingLesson.restrictionTime,
      );
    } else {
      result.lesson.lessonProgress[0] = {
        completed: false,
        quizPassed: false,
        lessonId: lessonId,
        lastWatched: pendingLesson.lastWatched,
        actualWatchTime: pendingLesson.delta,
        restrictionTime: pendingLesson.restrictionTime,
      } as (typeof result.lesson.lessonProgress)[0];
    }
  }

  return { ...result, version: currentVersion };
}

export type LessonContentType = Awaited<ReturnType<typeof getLessonContent>>;
