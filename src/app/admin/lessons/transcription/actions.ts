'use server';

import { prisma as db } from '@/lib/db';
import { uploadTranscriptionToS3 } from '@/lib/s3-transcription-upload';
import { invalidateCache, incrementGlobalVersion, GLOBAL_CACHE_KEYS } from '@/lib/redis';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

/**
 * Save transcription to S3 and database
 */
export async function storeTranscription(
  lessonId: string,
  vttContent: string,
  videoKey?: string
): Promise<{
  success: boolean;
  transcriptionId?: string;
  error?: string;
}> {
  try {
    // Verify admin authorization
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user || session.user.role !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }

    // Upload VTT to S3. Group with video if videoKey provided.
    let customKey: string | undefined;
    if (videoKey && videoKey.includes('.')) {
        const baseKey = videoKey.substring(0, videoKey.lastIndexOf('.'));
        customKey = `hls/${baseKey}/caption.vtt`;
    }

    const { key, url } = await uploadTranscriptionToS3(lessonId, vttContent, customKey);

    // Save to database (upsert)
    const transcription = await db.transcription.upsert({
      where: { lessonId },
      create: {
        lessonId,
        vttUrl: url,
        vttKey: key,
        status: 'COMPLETED',
      },
      update: {
        vttUrl: url,
        vttKey: key,
        status: 'COMPLETED',
        updatedAt: new Date(),
      },
    });

    // Invalidate caches
    await Promise.all([
      invalidateCache(`lesson:${lessonId}`),
      invalidateCache(`lesson:questions:${lessonId}`), // Clear MCQ cache
      invalidateCache(`lesson:content:${lessonId}`),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION),
    ]);

    return {
      success: true,
      transcriptionId: transcription.id,
    };
  } catch (error) {
    console.error('[Store Transcription Error]', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to store transcription',
    };
  }
}

/**
 * Get transcription for a lesson
 */
export async function getTranscription(lessonId: string): Promise<{
  success: boolean;
  transcription?: {
    id: string;
    vttUrl: string;
    status: string;
    hasMCQs: boolean;
  };
  error?: string;
}> {
  try {
    const [transcription, questionCount] = await Promise.all([
      db.transcription.findUnique({
        where: { lessonId },
        select: {
          id: true,
          vttUrl: true,
          status: true,
        },
      }),
      db.question.count({
        where: { lessonId },
      }),
    ]);

    if (!transcription) {
      return { success: false, error: 'Transcription not found' };
    }

    return {
      success: true,
      transcription: {
        ...transcription,
        hasMCQs: questionCount > 0,
      },
    };
  } catch (error) {
    console.error('[Get Transcription Error]', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch transcription',
    };
  }
}

/**
 * Delete transcription
 */
export async function deleteTranscription(lessonId: string): Promise<{
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

    await db.transcription.delete({
      where: { lessonId },
    });

    // Invalidate caches
    await Promise.all([
      invalidateCache(`lesson:${lessonId}`),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION),
    ]);

    return { success: true };
  } catch (error) {
    console.error('[Delete Transcription Error]', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete transcription',
    };
  }
}
