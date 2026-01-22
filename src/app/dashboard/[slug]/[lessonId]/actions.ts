"use server";

import { requireUser } from "@/app/data/user/require-user";
import { prisma } from "@/lib/db";
import { ApiResponse } from "@/lib/types";
import { revalidatePath } from "next/cache";

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
 * 
 * @param lessonId - The lesson ID
 * @param lastWatched - Current video position (in seconds)
 * @param actualWatchDelta - Session watch time delta to ADD (in seconds)
 * 
 * How it prevents double counting:
 * 1. Client always sends DELTA (session time), never total
 * 2. Database uses atomic increment: actualWatchTime += delta
 * 3. Client resets session counter to 0 after each sync
 * 4. Cookie is cleared after sync to prevent re-sync
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