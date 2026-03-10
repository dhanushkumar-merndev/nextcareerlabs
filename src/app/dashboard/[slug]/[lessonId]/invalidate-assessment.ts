"use server";
import { requireUser } from "@/app/data/user/require-user";
import { prisma } from "@/lib/db";
import {
  invalidateCache,
  GLOBAL_CACHE_KEYS,
  incrementGlobalVersion,
} from "@/lib/redis";
import { revalidatePath } from "next/cache";

export async function checkAndInvalidateAssessmentEligibility(
  lessonId: string,
  slug: string,
) {
  const session = await requireUser();

  // 0. Server-side guard: check if already completed to avoid redundant cache invalidations
  const existingProgress = await prisma.lessonProgress.findUnique({
    where: {
      userId_lessonId: { userId: session.id, lessonId },
    },
    select: { completed: true },
  });

  if (existingProgress?.completed) {
    console.log(
      `[AssessmentEligibility] Lesson ${lessonId} already marked COMPLETED for User ${session.id}. Skipping.`,
    );
    return { status: "success", alreadyCompleted: true };
  }

  console.log(
    `[AssessmentEligibility] Met 90% threshold for User=${session.id}, Lesson=${lessonId}. Marking as COMPLETED in DB.`,
  );

  await Promise.all([
    // 1. Persist the completion status so it survives refreshes/re-renders
    prisma.lessonProgress.upsert({
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
    }),
    // 2. Invalidate all relevant caches
    invalidateCache(`user:dashboard:${session.id}`),
    invalidateCache(`user:sidebar:${session.id}:${slug}`),
    invalidateCache(`user:lesson:${session.id}:${lessonId}`),
    incrementGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(session.id)),
  ]);

  revalidatePath(`/dashboard/${slug}`, "layout");
  revalidatePath(`/dashboard/${slug}/${lessonId}`);

  return { status: "success" };
}
