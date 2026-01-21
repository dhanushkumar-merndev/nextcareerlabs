"use server";

import { requireUser } from "@/app/data/user/require-user";
import { prisma } from "@/lib/db";
import { ApiResponse } from "@/lib/types";
import { revalidatePath } from "next/cache";

export async function markLessonComplete(
  lessonId: string,
  slug: string
): Promise<ApiResponse> {
  const session = await requireUser();
  try {
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
    revalidatePath(`/dashboard/${slug}`);
    return {
      status: "success",
      message: "Lesson marked as complete",
    };
  } catch {
    return {
      status: "error",
      message: "Something went wrong",
    };
  }
}

export async function updateVideoProgress(
  lessonId: string,
  lastWatched: number,
  actualWatchTime?: number
): Promise<ApiResponse> {
  const session = await requireUser();
  try {
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
        lastWatched: lastWatched,
        actualWatchTime: actualWatchTime ?? 0,
      },
      update: {
        lastWatched: lastWatched,
        actualWatchTime: actualWatchTime,
      },
    });
    return {
      status: "success",
      message: "Progress updated",
    };
  } catch {
    return {
      status: "error",
      message: "Failed to update progress",
    };
  }
}
