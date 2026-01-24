"use server";

import { requireUser } from "@/app/data/user/require-user";
import { prisma } from "@/lib/db";
import { ApiResponse } from "@/lib/types";
import { revalidatePath } from "next/cache";

import { invalidateCache, GLOBAL_CACHE_KEYS, incrementGlobalVersion } from "@/lib/redis";

/**
 * Mark a lesson as completed
 */
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
    
    // Invalidate dashboard cache
    await Promise.all([
        invalidateCache(`user:dashboard:${session.id}`),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(session.id))
    ]);

    revalidatePath(`/dashboard/${slug}`);
    
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
  actualWatchDelta = 0
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
      },
      update: {
        lastWatched, // Always update position
        actualWatchTime: {
          increment: actualWatchDelta, // ✅ Atomic increment (no double counting)
        },
      },
    });

    // We don't necessarily need to invalidate dashboard for EVERY second watched,
    // but maybe occasionally? Let's skip for now to avoid rapid hits to Redis.
    // Dashboard usually care about 'completed' anyway.

    return { 
      status: "success", 
      message: "Progress updated" 
    };
  } catch (error) {
    console.error("Error updating video progress:", error);
    return { 
      status: "error", 
      message: "Failed to update progress" 
    };
  }
}
