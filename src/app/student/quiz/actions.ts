'use server';

import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { invalidateCache, incrementGlobalVersion } from '@/lib/redis';

/**
 * Submit quiz answers and validate
 */
export async function submitQuiz(
  lessonId: string,
  answers: number[] // Array of selected indices [0-3]
): Promise<{
  success: boolean;
  score?: number;
  passed?: boolean;
  correctAnswers?: boolean[];
  error?: string;
}> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Fetch questions from database
    const questions = await db.question.findMany({
      where: { lessonId },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        correctIdx: true,
      },
    });

    if (questions.length !== 20) {
      return { success: false, error: 'Lesson must have exactly 20 questions' };
    }

    if (answers.length !== 20) {
      return { success: false, error: 'Must answer all 20 questions' };
    }

    // Calculate score
    let score = 0;
    const correctAnswers: boolean[] = [];

    for (let i = 0; i < 20; i++) {
      const isCorrect = answers[i] === questions[i].correctIdx;
      correctAnswers.push(isCorrect);
      if (isCorrect) score++;
    }

    const passed = score >= 15; // 75% threshold

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
      await Promise.all([
        invalidateCache(`user:${session.user.id}:progress`),
        invalidateCache(`lesson:${lessonId}:progress:${session.user.id}`),
        invalidateCache(`course:progress:${session.user.id}`),
        incrementGlobalVersion(),
      ]);
    }

    return {
      success: true,
      score,
      passed,
      correctAnswers,
    };
  } catch (error) {
    console.error('[Submit Quiz Error]', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to submit quiz',
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
      return { success: false, error: 'Not authenticated' };
    }

    const attempts = await db.quizAttempt.findMany({
      where: {
        userId: session.user.id,
        lessonId,
      },
      orderBy: { completedAt: 'desc' },
      select: {
        id: true,
        score: true,
        passed: true,
        completedAt: true,
      },
    });

    const bestScore = attempts.length > 0
      ? Math.max(...attempts.map(a => a.score))
      : 0;

    const hasPassed = attempts.some(a => a.passed);

    return {
      success: true,
      attempts,
      bestScore,
      hasPassed,
    };
  } catch (error) {
    console.error('[Get Quiz Attempts Error]', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch attempts',
    };
  }
}
