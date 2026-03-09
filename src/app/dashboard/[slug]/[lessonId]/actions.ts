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

  try {
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

    // ✅ Invalidate ALL relevant Redis caches
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

  try {
    // ✅ Atomic update prevents race conditions
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
        lastWatched,
        actualWatchTime: actualWatchDelta, // First time: set initial value
        restrictionTime: restrictionTime ?? 0,
      },
      update: {
        lastWatched, // Always update position
        actualWatchTime: {
          increment: actualWatchDelta, // ✅ Atomic increment (no double counting)
        },
      },
    });

    // ✅ Security: Fetch current progress to validate restrictionTime against actualWatchTime
    const currentProgress = await prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId: session.id, lessonId } },
      select: { actualWatchTime: true },
    });

    const totalWatchTime =
      (currentProgress?.actualWatchTime || 0) + actualWatchDelta;

    // Allow a small buffer (e.g. 10%) for variations in play speed or seeking back and forth,
    // but prevent skipping 10 minutes if you only watched 1 minute.
    const maxAllowedRestriction = totalWatchTime * 1.5 + 30; // 50% buffer + 30s grace
    const validatedRestriction =
      restrictionTime !== undefined
        ? Math.min(restrictionTime, maxAllowedRestriction)
        : undefined;

    // ✅ Update restrictionTime only if the new value is higher (high-water mark)
    if (validatedRestriction !== undefined && validatedRestriction > 0) {
      await prisma.$executeRaw`
        UPDATE "LessonProgress"
        SET "restrictionTime" = GREATEST("restrictionTime", ${validatedRestriction})
        WHERE "userId" = ${session.id} AND "lessonId" = ${lessonId}
      `;
    }

    // ✅ Invalidate caches so refresh/sidebar reflects new progress
    // We only do this for the specific lesson and sidebar to keep it light
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
    // Process all updates in a single transaction
    await prisma.$transaction(
      updates.map((update) =>
        prisma.lessonProgress.upsert({
          where: {
            userId_lessonId: {
              userId: session.id,
              lessonId: update.lessonId,
            },
          },
          create: {
            userId: session.id,
            lessonId: update.lessonId,
            lastWatched: update.lastWatched,
            actualWatchTime: update.delta,
            restrictionTime: update.restrictionTime ?? 0,
          },
          update: {
            lastWatched: update.lastWatched,
            actualWatchTime: {
              increment: update.delta,
            },
          },
        }),
      ),
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
          const validated = Math.min(u.restrictionTime!, maxAllowed);

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

  try {
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
          completed: passed, // Mark complete ONLY if passed
          quizPassed: passed,
        },
        update: {
          // 🛡️ Protection: only update to 'true', never downgrade if they already passed
          quizPassed: passed,
          ...(passed ? { completed: true } : {}),
        },
      });

      // Fetch the actual current state to handle the edge case where they were already passed
      const currentProgress = await tx.lessonProgress.findUnique({
        where: { userId_lessonId: { userId: session.id, lessonId } },
        select: { quizPassed: true, completed: true },
      });

      // If they were already passed, we ensure the status remains 'true'
      if (
        currentProgress &&
        (currentProgress.quizPassed || currentProgress.completed)
      ) {
        if (!passed) {
          await tx.lessonProgress.update({
            where: { userId_lessonId: { userId: session.id, lessonId } },
            data: { quizPassed: true, completed: true },
          });
        }
      }
    });

    // 4. Invalidate caches (same as markLessonComplete)
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
