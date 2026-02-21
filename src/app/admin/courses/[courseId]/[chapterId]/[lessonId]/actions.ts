"use server";

import { requireAdmin } from "@/app/data/admin/require-admin";
import { prisma } from "@/lib/db";
import { ApiResponse } from "@/lib/types/auth";
import { lessonSchema, LessonSchemaType } from "@/lib/zodSchemas";
import { invalidateCache, incrementGlobalVersion, GLOBAL_CACHE_KEYS } from "@/lib/redis";

export async function updateLesson(
  values: LessonSchemaType,
  lessonId: string
): Promise<ApiResponse> {
  await requireAdmin();

  try {
    const result = lessonSchema.safeParse(values);
    if (!result.success) {
      return {
        status: "error",
        message: "invalid data",
      };
    }

    const fetchStartTime = Date.now();
    const existingLesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { videoKey: true },
    });
    console.log(`[updateLesson] Existing Fetch took ${Date.now() - fetchStartTime}ms`);

    const isVideoChanged = existingLesson?.videoKey !== result.data.videoKey;

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
          const { deleteS3File } = await import("@/lib/s3-delete-utils");
          // Non-blocking cleanup (don't await to avoid slowing down the response)
          deleteS3File(existingLesson.videoKey).catch(err => 
            console.error("[Cleanup Error] Failed to delete old video assets:", err)
          );
        }
      }
    });
    console.log(`[updateLesson] Transaction took ${Date.now() - updateStartTime}ms`);
    
    // Invalidate caches
    await Promise.all([
        invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS),
        invalidateCache(GLOBAL_CACHE_KEYS.COURSE_DETAIL_BY_ID(result.data.courseId)),
        invalidateCache(`lesson:${lessonId}`),
        invalidateCache(`lesson:questions:${lessonId}`),
        invalidateCache(`lesson:content:${lessonId}`),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION)
    ]);

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
