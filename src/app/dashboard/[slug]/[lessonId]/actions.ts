"use server";

import { requireUser } from "@/app/data/user/require-user";
import { prisma } from "@/lib/db";
import { ApiResponse } from "@/lib/types/auth";
import { revalidatePath } from "next/cache";

import {
  invalidateCache,
  GLOBAL_CACHE_KEYS,
  incrementGlobalVersion,
} from "@/lib/redis";
import { QUIZ_PASS_THRESHOLD } from "@/lib/constants";

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
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION),
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
 * Update video progress with atomic increment for watch time
 */
export async function updateVideoProgress(
  lessonId: string,
  lastWatched: number,
  actualWatchDelta = 0,
  restrictionTime?: number,
): Promise<ApiResponse> {
  const session = await requireUser();

  console.log(
    `[updateVideoProgress] Start: User=${session.id}, Lesson=${lessonId}, LastWatched=${lastWatched}, Delta=${actualWatchDelta}, Restriction=${restrictionTime}`,
  );
  try {
    const startTime = Date.now();
    // ✅ 1. Fetch current state for sanity check
    const existing = await prisma.lessonProgress.findUnique({
      where: {
        userId_lessonId: { userId: session.id, lessonId },
      },
      select: { updatedAt: true, actualWatchTime: true },
    });
    console.log(
      `[updateVideoProgress] Fetch existing state took ${Date.now() - startTime}ms`,
    );

    // ✅ 2. Sanity Check: Prevent "accelerated" watch time
    // If the user says they watched 60 seconds but only 5 seconds passed since the last sync,
    // they are likely manipulating the client state.
    let validatedDelta = actualWatchDelta;
    if (existing && actualWatchDelta > 0) {
      const elapsedMs = Date.now() - existing.updatedAt.getTime();
      const elapsedSec = elapsedMs / 1000;

      const maxPossibleDelta = elapsedSec + 15; // Increased buffer for sync timing

      if (actualWatchDelta > maxPossibleDelta) {
        console.warn(
          `[Security] Watch time anomaly for User ${session.id}, Lesson ${lessonId}. Requested: ${actualWatchDelta}s, Max allowed: ${maxPossibleDelta}s. Capping to elapsed.`,
        );
        validatedDelta = elapsedSec;
      }
    }

    // ✅ 3. Fetch lesson to calculate security caps
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { duration: true },
    });

    const lessonDuration = lesson?.duration ? lesson.duration : 1000000; // DB duration is in seconds

    // ✅ "PRECISE" SYNC: Trust the client's high-water mark exactly (capped only by duration)
    const validatedRestriction =
      restrictionTime !== undefined
        ? Math.round(Math.min(restrictionTime, lessonDuration))
        : undefined;

    // ✅ 4. Atomic update with capped values (Rounded for precision)
    await prisma.lessonProgress.upsert({
      where: {
        userId_lessonId: {
          userId: session.id,
          lessonId,
        },
      },
      create: {
        userId: session.id,
        lessonId,
        lastWatched: Math.round(
          Math.min(lastWatched, validatedRestriction ?? lessonDuration),
        ),
        actualWatchTime: Math.round(Math.max(0, validatedDelta)),
        restrictionTime: validatedRestriction ?? 0,
      },
      update: {
        lastWatched: Math.round(
          Math.min(
            lastWatched,
            validatedRestriction ??
              (existing ? (existing as any).restrictionTime : lessonDuration) ??
              lessonDuration,
          ),
        ),
        actualWatchTime: {
          increment: Math.max(0, validatedDelta),
        },
      },
    });

    // ✅ 5. Update restrictionTime only if the new value is higher (high-water mark)
    if (validatedRestriction !== undefined && validatedRestriction > 0) {
      await prisma.$executeRaw`
        UPDATE "LessonProgress"
        SET "restrictionTime" = GREATEST("restrictionTime", ${validatedRestriction})
        WHERE "userId" = ${session.id} AND "lessonId" = ${lessonId}
      `;
    }

    console.log(
      `[updateVideoProgress] Core logic execution (Security + Upsert + Raw Update) took ${Date.now() - startTime}ms`,
    );

    // ✅ Invalidate caches so refresh/sidebar reflects new progress
    console.log(
      `[updateVideoProgress] Invalidating specific lesson/sidebar cache for User=${session.id}`,
    );
    await Promise.all([
      invalidateCache(`user:lesson:${session.id}:${lessonId}`),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(session.id)),
    ]);

    // Revalidate the lesson page to ensure UI is fresh
    revalidatePath(`/dashboard/[slug]/${lessonId}`, "page");

    return {
      status: "success",
      message: "Progress updated",
    };
  } catch (error) {
    console.error("Error updating video progress:", error);
    return {
      status: "error",
      message: "Failed to update progress",
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
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION),
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
