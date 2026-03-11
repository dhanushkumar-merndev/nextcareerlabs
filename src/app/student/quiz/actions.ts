"use server";

import { prisma as db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  invalidateCache,
  incrementGlobalVersion,
  GLOBAL_CACHE_KEYS,
} from "@/lib/redis";
import { QUIZ_PASS_THRESHOLD } from "@/lib/constants";

/**
 * Submit quiz answers and validate
 */
export async function submitQuiz(
  lessonId: string,
  answers: number[], // Array of selected indices [0-3]
): Promise<{
  success: boolean;
  score?: number;
  passed?: boolean;
  correctAnswers?: boolean[];
  error?: string;
}> {
  console.log(`[submitQuiz] Start: LessonId=${lessonId}`);
  const startTime = Date.now();
  try {
    const authStartTime = Date.now();
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    console.log(`[submitQuiz] Auth check took ${Date.now() - authStartTime}ms`);
    console.log(`[submitQuiz] User detected: ${session?.user?.id || "None"}`);

    if (!session?.user) {
      return { success: false, error: "Not authenticated" };
    }

    // 🛡️ Security Check: Verify Enrollment
    const enrollment = await db.enrollment.findFirst({
      where: {
        userId: session.user.id,
        Course: {
          chapter: {
            some: {
              lesson: {
                some: { id: lessonId },
              },
            },
          },
        },
        status: "Granted",
      },
    });

    if (!enrollment) {
      return {
        success: false,
        error: "Forbidden: You are not enrolled in this course",
      };
    }

    // Fetch questions from database
    const questions = await db.question.findMany({
      where: { lessonId },
      orderBy: { order: "asc" },
      select: {
        id: true,
        correctIdx: true,
      },
    });

    if (questions.length !== 20) {
      return { success: false, error: "Lesson must have exactly 20 questions" };
    }

    if (answers.length !== 20) {
      return { success: false, error: "Must answer all 20 questions" };
    }

    // Calculate score
    let score = 0;
    const correctAnswers: boolean[] = [];

    for (let i = 0; i < 20; i++) {
      const isCorrect = answers[i] === questions[i].correctIdx;
      correctAnswers.push(isCorrect);
      if (isCorrect) score++;
    }

    const passed = score >= QUIZ_PASS_THRESHOLD;

    // Create QuizAttempt record
    await db.quizAttempt.create({
      data: {
        userId: session.user.id,
        lessonId,
        answers,
        score,
        passed,
      },
    });

    // Update lesson progress if passed
    if (passed) {
      await db.lessonProgress.upsert({
        where: {
          userId_lessonId: {
            userId: session.user.id,
            lessonId,
          },
        },
        create: {
          userId: session.user.id,
          lessonId,
          completed: true,
          quizPassed: true,
        },
        update: {
          completed: true,
          quizPassed: true,
          updatedAt: new Date(),
        },
      });

      // Invalidate progress caches
      console.log(
        `[submitQuiz] Invalidating progress caches for User=${session.user.id}`,
      );
      const cacheStartTime = Date.now();
      await Promise.all([
        invalidateCache(`user:dashboard:${session.user.id}`),
        invalidateCache(`user:lesson:${session.user.id}:${lessonId}`),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(session.user.id)),
      ]);
      console.log(
        `[submitQuiz] Cache invalidation took ${Date.now() - cacheStartTime}ms`,
      );
    }

    console.log(
      `[submitQuiz] Done in ${Date.now() - startTime}ms (Score: ${score}, Passed: ${passed})`,
    );

    return {
      success: true,
      score,
      passed,
      correctAnswers,
    };
  } catch (error) {
    console.error("[Submit Quiz Error]", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to submit quiz",
    };
  }
}

/**
 * Get quiz attempts for a user/lesson
 */
export async function getQuizAttempts(lessonId: string): Promise<{
  success: boolean;
  attempts?: Array<{
    id: string;
    score: number;
    passed: boolean;
    completedAt: Date;
  }>;
  bestScore?: number;
  hasPassed?: boolean;
  error?: string;
}> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { success: false, error: "Not authenticated" };
    }

    const attempts = await db.quizAttempt.findMany({
      where: {
        userId: session.user.id,
        lessonId,
      },
      orderBy: { completedAt: "desc" },
      select: {
        id: true,
        score: true,
        passed: true,
        completedAt: true,
      },
    });

    const bestScore =
      attempts.length > 0 ? Math.max(...attempts.map((a) => a.score)) : 0;

    const hasPassed = attempts.some((a) => a.passed);

    return {
      success: true,
      attempts,
      bestScore,
      hasPassed,
    };
  } catch (error) {
    console.error("[Get Quiz Attempts Error]", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to fetch attempts",
    };
  }
}
