"use server";

import { requireUser } from "@/app/data/user/require-user";
import { prisma } from "@/lib/db";
import { ApiResponse } from "@/lib/types/auth";
import { revalidatePath } from "next/cache";

import {
  invalidateCache,
  GLOBAL_CACHE_KEYS,
  incrementGlobalVersion,
  incrementGlobalVersionDebounced,
  withCache,
  checkRateLimit,
  setUserPendingProgress,
  getUserPendingProgress,
  clearUserPendingProgress,
  redis,
} from "@/lib/redis";
import { QUIZ_PASS_THRESHOLD } from "@/lib/constants";

/**
 * [Million-User Scale] Internal Sync Logic
 * Flushes pending Redis progress to Postgres
 */
async function flushPendingProgress(userId: string) {
  const pending = await getUserPendingProgress(userId);
  const lessonIds = Object.keys(pending);
  if (lessonIds.length === 0) return;

  console.log(
    `[Flush] Found ${lessonIds.length} pending lessons for User=${userId}. Syncing to DB...`,
  );

  try {
    // 🛡️ Batch UPSERT using Raw SQL for maximum performance
    // We process each lesson in the pending set
    for (const [lessonId, data] of Object.entries(pending)) {
      const p = data as any;
      await prisma.$executeRaw`
        INSERT INTO "LessonProgress" ("id", "userId", "lessonId", "lastWatched", "actualWatchTime", "restrictionTime", "updatedAt", "completed", "quizPassed")
        VALUES (gen_random_uuid(), ${userId}, ${lessonId}, ${Math.round(p.lastWatched)}, ${Math.round(p.delta)}, ${Math.round(p.restrictionTime)}, NOW(), false, false)
        ON CONFLICT ("userId", "lessonId")
        DO UPDATE SET
          "lastWatched" = EXCLUDED."lastWatched",
          "actualWatchTime" = "LessonProgress"."actualWatchTime" + EXCLUDED."actualWatchTime",
          "restrictionTime" = GREATEST("LessonProgress"."restrictionTime", EXCLUDED."restrictionTime"),
          "updatedAt" = NOW();
      `;
    }

    // Clear the pending set after successful DB sync
    await clearUserPendingProgress(userId, lessonIds);
    console.log(`[Flush] ✅ Sync complete for User=${userId}`);
  } catch (error) {
    console.error(`[Flush] ❌ Sync failed for User=${userId}:`, error);
  }
}

/**
 * Manually trigger a sync (e.g., on page leave or tab switch)
 */
export async function syncProgressAction(): Promise<ApiResponse> {
  const session = await requireUser();
  await flushPendingProgress(session.id);
  return { status: "success", message: "Progress synced" };
}

/**
 * Update video progress with Redis-First Write-Behind
 */
export async function updateVideoProgress(
  lessonId: string,
  lastWatched: number,
  actualWatchDelta = 0,
  restrictionTime?: number,
): Promise<ApiResponse> {
  const session = await requireUser();

  // 🛡️ [Million-User Scale] Rate Limit: 10 per minute per student
  const rl = await checkRateLimit(`action:updateVideoProgress:${session.id}`, 10, 60);
  if (!rl.success) {
    return { status: "error", message: "Updating too frequently" };
  }

  // 🛡️ [Million-User Scale] Security Check: Cached Enrollment Verify
  // This prevents hitting the DB on every 5s heartbeat per student.
  const isEnrolled = await withCache(`enrollment:verify:${session.id}:${lessonId}`, async () => {
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        userId: session.id,
        Course: {
          chapter: { some: { lesson: { some: { id: lessonId } } } },
        },
        status: "Granted",
      },
      select: { id: true },
    });
    return !!enrollment;
  }, 3600); // Cache for 1 hour

  if (!isEnrolled) {
    return { status: "error", message: "Forbidden: Not enrolled" };
  }

  try {
    // ── Tier 1: Fast Redis Write ──────────────────────────────────
    await setUserPendingProgress(session.id, lessonId, {
      lastWatched,
      delta: actualWatchDelta,
      restrictionTime: restrictionTime ?? 0,
      timestamp: Date.now(),
    });

    // ── Tier 2: Synchronous DB Flush ─────────────────────────────
    // [Million-User Scale] In "Sync-on-Leave" mode, we MUST await the flush 
    // to ensure the dashboard reflects the latest progress immediately.
    await flushPendingProgress(session.id);

    // ── Tier 3: Extensive Invalidation ────────────────────────────
    await Promise.all([
      invalidateCache(`user:lesson:${session.id}:${lessonId}`),
      // Invalidate the entire dashboard so the progress percentage updates
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(session.id)),
    ]);

    return { status: "success", message: "Progress saved to cache" };
  } catch (error) {
    console.error("Error in updateVideoProgress:", error);
    return { status: "error", message: "Failed to save progress" };
  }
}
/**
 * Mark a lesson as completed
 */
export async function markLessonComplete(
  lessonId: string,
  slug: string,
): Promise<ApiResponse> {
  const session = await requireUser();

  console.log(
    `[markLessonComplete] Start: User=${session.id}, Lesson=${lessonId}, Slug=${slug}`,
  );
  try {
    const startTime = Date.now();
    // 1. Check if the lesson has any MCQs
    const questionsCount = await prisma.question.count({
      where: { lessonId: lessonId },
    });

    // 2. If questions exist, check if user has passed the assessment
    if (questionsCount > 0) {
      const progress = await prisma.lessonProgress.findUnique({
        where: {
          userId_lessonId: {
            userId: session.id,
            lessonId: lessonId,
          },
        },
        select: { quizPassed: true, completed: true },
      });

      if (!progress?.quizPassed && !progress?.completed) {
        return {
          status: "error",
          message:
            "You must pass the assessment quiz before marking this lesson as complete.",
        };
      }
    }

    await prisma.lessonProgress.upsert({
      where: {
        userId_lessonId: {
          userId: session.id,
          lessonId: lessonId,
        },
      },
      create: {
        userId: session.id,
        lessonId: lessonId,
        completed: true,
      },
      update: {
        completed: true,
      },
    });
    console.log(
      `[markLessonComplete] DB Upsert took ${Date.now() - startTime}ms`,
    );

    // ✅ Invalidate ALL relevant Redis caches
    console.log(
      `[markLessonComplete] Invalidating caches for User=${session.id}, Slug=${slug}`,
    );
    await Promise.all([
      invalidateCache(`user:dashboard:${session.id}`),
      invalidateCache(`user:sidebar:${session.id}:${slug}`),
      invalidateCache(`user:lesson:${session.id}:${lessonId}`),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(session.id)),
      // 🛡️ [Million-User Scale] Debounced: Only update admin analytics once every 60s
      incrementGlobalVersionDebounced(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION, 60),
    ]);

    // Revalidate the entire course dashboard to ensure everything is fresh
    revalidatePath(`/dashboard/${slug}`, "layout");
    revalidatePath(`/dashboard/${slug}/${lessonId}`);

    return {
      status: "success",
      message: "Lesson marked as complete",
    };
  } catch (error) {
    console.error("Error marking lesson complete:", error);
    return {
      status: "error",
      message: "Something went wrong",
    };
  }
}

/**
 * Update multiple video progresses in a single transaction
 */
export async function updateMultipleVideoProgress(
  updates: Array<{
    lessonId: string;
    lastWatched: number;
    delta: number;
    restrictionTime?: number;
  }>,
): Promise<ApiResponse> {
  const session = await requireUser();

  if (!updates || updates.length === 0) {
    return { status: "success", message: "No updates to process" };
  }

  try {
    // 1. Fetch durations for all targeted lessons to normalize and cap
    const lessons = await prisma.lesson.findMany({
      where: { id: { in: updates.map((u) => u.lessonId) } },
      select: { id: true, duration: true },
    });
    const lessonDurationsMap = new Map(
      lessons.map((l) => [l.id, l.duration || 0]),
    ); // seconds

    // 2. Fetch current progress to calculate deltas
    const currentProgress = await prisma.lessonProgress.findMany({
      where: {
        userId: session.id,
        lessonId: { in: updates.map((u) => u.lessonId) },
      },
      select: { lessonId: true, actualWatchTime: true, restrictionTime: true },
    });
    const currentProgressMap = new Map(
      currentProgress.map((p) => [p.lessonId, p]),
    );

    // 3. Process each update with security caps
    await prisma.$transaction(
      updates.map((update) => {
        const duration = lessonDurationsMap.get(update.lessonId) || 1000000;
        const existing = currentProgressMap.get(update.lessonId);

        // Capped only by lesson duration for precision
        const validatedRestriction = Math.round(
          Math.min(update.restrictionTime ?? duration, duration),
        );

        return prisma.lessonProgress.upsert({
          where: {
            userId_lessonId: {
              userId: session.id,
              lessonId: update.lessonId,
            },
          },
          create: {
            userId: session.id,
            lessonId: update.lessonId,
            lastWatched: Math.round(
              Math.min(update.lastWatched, validatedRestriction),
            ),
            actualWatchTime: Math.round(update.delta),
            restrictionTime: validatedRestriction,
          },
          update: {
            lastWatched: Math.round(
              Math.min(
                update.lastWatched,
                Math.max(validatedRestriction, existing?.restrictionTime || 0),
              ),
            ),
            actualWatchTime: {
              increment: update.delta,
            },
          },
        });
      }),
    );

    // ✅ Security: Fetch current progress for all lessons in the batch to validate restrictionTimes
    const batchLessonIds = updates.map((u) => u.lessonId);
    const existingProgress = await prisma.lessonProgress.findMany({
      where: { userId: session.id, lessonId: { in: batchLessonIds } },
      select: { lessonId: true, actualWatchTime: true },
    });

    const progressMap = new Map(
      existingProgress.map((p) => [p.lessonId, p.actualWatchTime]),
    );

    // ✅ Update restrictionTime using GREATEST for each entry that has it
    const restrictionUpdates = updates.filter(
      (u) => u.restrictionTime !== undefined && u.restrictionTime! > 0,
    );

    if (restrictionUpdates.length > 0) {
      await Promise.all(
        restrictionUpdates.map((u) => {
          const currentActual = progressMap.get(u.lessonId) || 0;
          const totalWatchTime = currentActual + u.delta;
          const maxAllowed = totalWatchTime * 1.5 + 30;
          const validated = Math.min(u.restrictionTime!, totalWatchTime + 60); // More headroom

          return prisma.$executeRaw`
              UPDATE "LessonProgress"
              SET "restrictionTime" = GREATEST("restrictionTime", ${validated})
              WHERE "userId" = ${session.id} AND "lessonId" = ${u.lessonId}
            `;
        }),
      );
    }

    // Invalidate caches for all affected lessons
    const cacheInvalidations = updates.flatMap((u) => [
      invalidateCache(`user:lesson:${session.id}:${u.lessonId}`),
    ]);

    await Promise.all([
      ...cacheInvalidations,
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(session.id)),
    ]);

    // Revalidate affected cache
    revalidatePath(`/dashboard`, "layout");

    return { status: "success", message: `Updated ${updates.length} items` };
  } catch (error) {
    console.error("Error updating multiple video progresses:", error);
    return { status: "error", message: "Failed to update progress batch" };
  }
}
/**
 * Submit a quiz attempt for a lesson
 */
export async function submitQuizAttempt(
  lessonId: string,
  slug: string,
  answers: number[],
): Promise<
  ApiResponse & {
    score?: number;
    passed?: boolean;
    feedback?: { id: string; correctIdx: number; explanation: string | null }[];
  }
> {
  const session = await requireUser();

  // 🛡️ Security Check: Verify Enrollment
  const enrollment = await prisma.enrollment.findFirst({
    where: {
      userId: session.id,
      Course: {
        chapter: { some: { lesson: { some: { id: lessonId } } } },
      },
      status: "Granted",
    },
  });

  if (!enrollment) {
    return { status: "error", message: "Forbidden: Not enrolled" };
  }

  console.log(
    `[submitQuizAttempt] Start: User=${session.id}, Lesson=${lessonId}, Slug=${slug}`,
  );
  try {
    const startTime = Date.now();
    // 1. Fetch correct answers from DB
    const questions = await prisma.question.findMany({
      where: { lessonId },
      orderBy: { order: "asc" },
      select: { id: true, correctIdx: true, explanation: true },
    });

    if (questions.length === 0) {
      return { status: "error", message: "No quiz found for this lesson" };
    }

    // 2. Calculate score
    let score = 0;
    questions.forEach((q, i) => {
      if (answers[i] === q.correctIdx) {
        score++;
      }
    });

    const passed = score >= QUIZ_PASS_THRESHOLD;

    // 3. Save attempt and update progress state
    await prisma.$transaction(async (tx) => {
      // Create the attempt record
      await tx.quizAttempt.create({
        data: {
          userId: session.id,
          lessonId,
          answers: answers as any,
          score,
          passed,
        },
      });

      // Update lesson progress
      await tx.lessonProgress.upsert({
        where: {
          userId_lessonId: {
            userId: session.id,
            lessonId,
          },
        },
        create: {
          userId: session.id,
          lessonId,
          quizPassed: passed,
          // completed is handled by watch-time logic (90%)
        },
        update: {
          // 🛡️ Protection: only update to 'true', never downgrade if they already passed
          quizPassed: {
            set: passed || undefined, // Prisma trick: only set if passed is true, otherwise keep existing
          },
        },
      });

      // Special case: if they already passed but this attempt failed, ensure quizPassed remains true
      if (!passed) {
        const currentProgress = await tx.lessonProgress.findUnique({
          where: { userId_lessonId: { userId: session.id, lessonId } },
          select: { quizPassed: true },
        });
        if (currentProgress?.quizPassed) {
          await tx.lessonProgress.update({
            where: { userId_lessonId: { userId: session.id, lessonId } },
            data: { quizPassed: true },
          });
        }
      }
    });

    console.log(
      `[submitQuizAttempt] Quiz processing (Score: ${score}, Passed: ${passed}) took ${Date.now() - startTime}ms`,
    );

    // 4. Invalidate caches (same as markLessonComplete)
    console.log(
      `[submitQuizAttempt] Invalidating caches for User=${session.id}, Slug=${slug}`,
    );
    await Promise.all([
      invalidateCache(`user:dashboard:${session.id}`),
      invalidateCache(`user:sidebar:${session.id}:${slug}`),
      invalidateCache(`user:lesson:${session.id}:${lessonId}`),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(session.id)),
      // 🛡️ [Million-User Scale] Debounced: Only update admin analytics once every 60s
      incrementGlobalVersionDebounced(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION, 60),
    ]);

    revalidatePath(`/dashboard/${slug}`, "layout");
    revalidatePath(`/dashboard/${slug}/${lessonId}`);

    return {
      status: "success",
      message: passed
        ? "Congratulations! You passed the quiz."
        : "You didn't pass the quiz. Please try again.",
      score,
      passed,
      feedback: questions,
    };
  } catch (error) {
    console.error("Error submitting quiz attempt:", error);
    return { status: "error", message: "Failed to submit quiz attempt" };
  }
}
