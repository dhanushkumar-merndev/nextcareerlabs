'use server';

import { prisma as db } from '@/lib/db';
import { uploadTranscriptionToS3 } from '@/lib/s3-transcription-upload';
import { invalidateCache, incrementGlobalVersion, GLOBAL_CACHE_KEYS, checkRateLimit } from '@/lib/redis';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { env } from '@/lib/env';

type GroqTranscriptionSegment = {
  start?: number;
  end?: number;
  text?: string;
};

type GroqTranscriptionResponse = {
  text?: string;
  segments?: GroqTranscriptionSegment[];
  error?: {
    message?: string;
  };
};

function formatVttTimestamp(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  const milliseconds = Math.round((safeSeconds - Math.floor(safeSeconds)) * 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${wholeSeconds
    .toString()
    .padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

function buildVttFromGroqResponse(response: GroqTranscriptionResponse) {
  const segments = response.segments?.filter(
    (segment) =>
      typeof segment.start === 'number' &&
      typeof segment.end === 'number' &&
      segment.text?.trim(),
  );

  if (segments?.length) {
    return [
      'WEBVTT',
      '',
      ...segments.flatMap((segment, index) => [
        String(index + 1),
        `${formatVttTimestamp(segment.start!)} --> ${formatVttTimestamp(segment.end!)}`,
        segment.text!.trim(),
        '',
      ]),
    ].join('\n');
  }

  if (response.text?.trim()) {
    return [
      'WEBVTT',
      '',
      '1',
      '00:00:00.000 --> 00:00:10.000',
      response.text.trim(),
      '',
    ].join('\n');
  }

  throw new Error('Groq did not return transcription text');
}

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
  console.log(`[TranscriptionAction] Storing transcription for lesson ${lessonId} (VideoKey: ${videoKey || 'none'})`);
  try {
    // Verify admin authorization
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user || session.user.role !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }

    // Rate Limit: 10 requests per minute for transcription mutations
    const rl = await checkRateLimit(`action:storeTranscription:${session.user.id}`, 10, 60);
    if (!rl.success) {
      return { success: false, error: `Rate limit exceeded. Try again in ${rl.reset} seconds.` };
    }

    // Upload VTT to S3. Group with video if videoKey provided.
    let customKey: string | undefined;
    if (videoKey) {
      const baseKey = videoKey.startsWith('hls/')
        ? videoKey.split('/')[1]
        : videoKey.replace(/\.[^/.]+$/, "");
      customKey = `hls/${baseKey}/caption.vtt`;
    }

    const { key, url } = await uploadTranscriptionToS3(lessonId, vttContent, customKey);

    const startTime = Date.now();
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
    console.log(`[storeTranscription] DB Upsert took ${Date.now() - startTime}ms`);

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
 * Generate WebVTT captions from the lesson audio using Groq Speech-to-Text.
 */
export async function generateTranscriptionWithGroq(
  lessonId: string,
  audioUrl: string,
  videoKey?: string,
): Promise<{
  success: boolean;
  transcriptionId?: string;
  vttContent?: string;
  error?: string;
}> {
  console.log(`[TranscriptionAction] Generating Groq transcription for lesson ${lessonId}`);

  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user || session.user.role !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }

    const rl = await checkRateLimit(`action:generateTranscription:${session.user.id}`, 3, 60);
    if (!rl.success) {
      return { success: false, error: `Rate limit exceeded. Try again in ${rl.reset} seconds.` };
    }

    if (!audioUrl) {
      return { success: false, error: 'Audio URL is required' };
    }

    const formData = new FormData();
    formData.set('model', 'whisper-large-v3');
    formData.set('url', audioUrl);
    formData.set('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'segment');
    formData.set('temperature', '0');

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
      },
      body: formData,
    });

    const transcription = (await response.json()) as GroqTranscriptionResponse;

    if (!response.ok) {
      return {
        success: false,
        error:
          transcription.error?.message ||
          `Groq transcription failed with status ${response.status}`,
      };
    }

    const vttContent = buildVttFromGroqResponse(transcription);
    const stored = await storeTranscription(lessonId, vttContent, videoKey);

    if (!stored.success) {
      return stored;
    }

    return {
      success: true,
      transcriptionId: stored.transcriptionId,
      vttContent,
    };
  } catch (error) {
    console.error('[Groq Transcription Error]', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate transcription',
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
  console.log(`[TranscriptionAction] Fetching transcription for lesson ${lessonId}`);
  try {
    const startTime = Date.now();
    const [transcription, questionCount] = await Promise.all([
      db.transcription.findUnique({
        where: { lessonId },
        select: {
          id: true,
          vttUrl: true,
          vttKey: true,
          status: true,
        },
      }),
      db.question.count({
        where: { lessonId },
      }),
    ]);
    console.log(`[getTranscription] DB Fetch (Unique + Count) took ${Date.now() - startTime}ms`);

    if (!transcription) {
      return { success: false, error: 'Transcription not found' };
    }

    return {
      success: true,
      transcription: {
        ...transcription,
        vttUrl: transcription.vttUrl.startsWith('http')
          ? transcription.vttUrl
          : `https://${env.S3_BUCKET_NAME}.t3.storage.dev/${transcription.vttUrl}`,
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
  console.log(`[TranscriptionAction] Deleting transcription for lesson ${lessonId}`);
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user || session.user.role !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }

    // Rate Limit: 10 requests per minute for mutations
    const rl = await checkRateLimit(`action:deleteTranscription:${session.user.id}`, 10, 60);
    if (!rl.success) {
      return { success: false, error: `Rate limit exceeded. Try again in ${rl.reset} seconds.` };
    }

    const startTime = Date.now();
    await db.transcription.delete({
      where: { lessonId },
    });
    console.log(`[deleteTranscription] DB Delete took ${Date.now() - startTime}ms`);

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
