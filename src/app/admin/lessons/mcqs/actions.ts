'use server';

import { prisma as db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { invalidateCache, incrementGlobalVersion, getCache, setCache, GLOBAL_CACHE_KEYS } from '@/lib/redis';

export interface MCQQuestion {
  question: string;
  options: string[];
  correctIdx: number;
  explanation?: string;
}

/**
 * Save MCQs to database
 */
export async function saveMCQs(
  lessonId: string,
  questionsJson: string
): Promise<{
  success: boolean;
  count?: number;
  error?: string;
}> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user || session.user.role !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }

    // Parse and validate JSON
    let questions: MCQQuestion[];
    try {
      questions = JSON.parse(questionsJson);
    } catch {
      return { success: false, error: 'Invalid JSON format' };
    }

    if (!Array.isArray(questions) || questions.length !== 20) {
      return { success: false, error: 'Must provide exactly 20 questions' };
    }

    // Validate each question
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question || !Array.isArray(q.options) || q.options.length !== 4) {
        return { success: false, error: `Invalid question format at index ${i}` };
      }
      if (typeof q.correctIdx !== 'number' || q.correctIdx < 0 || q.correctIdx > 3) {
        return { success: false, error: `Invalid correctIdx at index ${i}` };
      }
    }

    // Delete existing questions for this lesson
    await db.question.deleteMany({
      where: { lessonId },
    });

    // Create new questions
    await db.question.createMany({
      data: questions.map((q, index) => ({
        lessonId,
        question: q.question,
        options: q.options,
        correctIdx: q.correctIdx,
        explanation: q.explanation || null,
        order: index + 1,
      })),
    });

    // Invalidate caches
    await Promise.all([
      invalidateCache(`lesson:${lessonId}`),
      invalidateCache(`lesson:questions:${lessonId}`),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION),
    ]);

    return {
      success: true,
      count: questions.length,
    };
  } catch (error) {
    console.error('[Save MCQs Error]', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save questions',
    };
  }
}

/**
 * Get MCQs for a lesson (with Smart Caching)
 */
export async function getLessonMCQs(lessonId: string): Promise<{
  success: boolean;
  questions?: Array<{
    id: string;
    question: string;
    options: unknown;
    correctIdx: number;
    explanation: string | null;
    order: number;
  }>;
  error?: string;
}> {
  try {
    const cacheKey = `lesson:questions:${lessonId}`;
    
    // 1. Try to get from cache
    const cachedQuestions = await getCache<any[]>(cacheKey);
    if (cachedQuestions) {
      console.log(`[MCQ Cache] Hit for lesson ${lessonId}`);
      return {
        success: true,
        questions: cachedQuestions,
      };
    }

    // 2. Fallback to Database
    const questions = await db.question.findMany({
      where: { lessonId },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        question: true,
        options: true,
        correctIdx: true,
        explanation: true,
        order: true,
      },
    });

    // 3. Store in cache (if exists)
    if (questions.length > 0) {
      await setCache(cacheKey, questions, 86400); // Cache for 24 hours
    }

    return {
      success: true,
      questions,
    };
  } catch (error) {
    console.error('[Get MCQs Error]', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch questions',
    };
  }
}

/**
 * Delete all MCQs for a lesson
 */
export async function deleteLessonMCQs(lessonId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user || session.user.role !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }

    await db.question.deleteMany({
      where: { lessonId },
    });

    await Promise.all([
      invalidateCache(`lesson:${lessonId}`),
      invalidateCache(`lesson:questions:${lessonId}`),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION),
    ]);

    return { success: true };
  } catch (error) {
    console.error('[Delete MCQs Error]', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete questions',
    };
  }
}
