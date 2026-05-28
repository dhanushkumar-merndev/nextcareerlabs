"use server";

import { requireAdmin } from "@/app/data/admin/require-admin";
import { prisma } from "@/lib/db";
import { ApiResponse } from "@/lib/types/auth";
import { lessonSchema, LessonSchemaType } from "@/lib/zodSchemas";
import {
  invalidateCache,
  GLOBAL_CACHE_KEYS,
  dirtyCourse,
  incrementGlobalVersion,
} from "@/lib/redis";
import { deleteS3File } from "@/lib/s3-delete-utils";

export async function updateLesson(
  values: LessonSchemaType,
  lessonId: string,
): Promise<ApiResponse> {
  console.log(
    `[updateLesson] Start: LessonId=${lessonId}, Name=${values.name}`,
  );
  const authStartTime = Date.now();
  await requireAdmin();
  console.log(`[updateLesson] Auth check took ${Date.now() - authStartTime}ms`);

  try {
    const result = lessonSchema.safeParse(values);
    if (!result.success) {
      return {
        status: "error",
        message: result.error.issues[0]?.message ?? "Invalid data",
      };
    }

    const fetchStartTime = Date.now();
    const existingLesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { videoKey: true },
    });
    console.log(
      `[updateLesson] Existing Fetch took ${Date.now() - fetchStartTime}ms`,
    );

    const isVideoChanged = existingLesson?.videoKey !== result.data.videoKey;

    let oldVideoKeyToDelete: string | null = null;
    const updateStartTime = Date.now();
    await prisma.$transaction(async (tx) => {
      await tx.lesson.update({
        where: {
          id: lessonId,
        },
        data: {
          title: result.data.name,
          description: result.data.description,
          thumbnailKey: result.data.thumbnailKey,
          videoKey: result.data.videoKey,
          duration: result.data.duration,
          // Sprite sheet metadata
          spriteKey: result.data.spriteKey,
          spriteCols: result.data.spriteCols,
          spriteRows: result.data.spriteRows,
          spriteInterval: result.data.spriteInterval,
          spriteWidth: result.data.spriteWidth,
          spriteHeight: result.data.spriteHeight,
          lowResKey: result.data.lowResKey,
          videoEncryptionKey: result.data.videoEncryptionKey,
          videoEncryptionIV: result.data.videoEncryptionIV,
        },
      });

      if (isVideoChanged) {
        // Reset progress and delete all video-related content
        await Promise.all([
          tx.lessonProgress.deleteMany({ where: { lessonId } }),
          tx.question.deleteMany({ where: { lessonId } }),
          tx.transcription.deleteMany({ where: { lessonId } }),
          tx.quizAttempt.deleteMany({ where: { lessonId } }),
        ]);

        // Cleanup old S3 files (HLS, Sprites, etc.)
        if (existingLesson?.videoKey) {
          oldVideoKeyToDelete = existingLesson.videoKey;
        }
      }
    });
    console.log(
      `[updateLesson] Transaction took ${Date.now() - updateStartTime}ms`,
    );

    if (oldVideoKeyToDelete) {
      await deleteS3File(oldVideoKeyToDelete);
    }

    // Invalidate caches
    console.log(
      `[updateLesson] Invalidating caches for LessonId=${lessonId} and Course=${result.data.courseId}`,
    );
    const cacheStartTime = Date.now();
    await Promise.all([
      invalidateCache(
        GLOBAL_CACHE_KEYS.COURSE_DETAIL_BY_ID(result.data.courseId),
      ),
      invalidateCache(`lesson:${lessonId}`),
      invalidateCache(`lesson:questions:${lessonId}`),
      invalidateCache(`lesson:content:${lessonId}`),
      dirtyCourse(result.data.courseId),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_COURSES_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION),
    ]);
    console.log(
      `[updateLesson] Cache invalidation took ${Date.now() - cacheStartTime}ms`,
    );

    return {
      status: "success",
      message: isVideoChanged
        ? "Lesson updated and progress reset due to video change"
        : "lesson updated successfully",
    };
  } catch (err) {
    console.error("Update lesson error:", err);
    return {
      status: "error",
      message: "failed to update lesson",
    };
  }
}
