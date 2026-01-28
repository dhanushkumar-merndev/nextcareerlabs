"use server";

import { requireAdmin } from "@/app/data/admin/require-admin";
import { prisma } from "@/lib/db";
import { ApiResponse } from "@/lib/types/auth";
import { lessonSchema, LessonSchemaType } from "@/lib/zodSchemas";

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

    const existingLesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { videoKey: true },
    });

    const isVideoChanged = existingLesson?.videoKey !== result.data.videoKey;

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
        },
      });

      if (isVideoChanged) {
        // Reset progress for all users if the video has changed
        await tx.lessonProgress.deleteMany({
          where: {
            lessonId: lessonId,
          },
        });
      }
    });

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
