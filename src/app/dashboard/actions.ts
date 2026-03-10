"use server";

import { prisma } from "@/lib/db";
import {
  getCache,
  setCache,
  GLOBAL_CACHE_KEYS,
  getGlobalVersion,
} from "@/lib/redis";
import { requireUser } from "../data/user/require-user";

export async function getUserDashboardData(clientVersion?: string) {
  const user = await requireUser();
  const userId = user.id;

  const [userVersion, globalCoursesVersion] = await Promise.all([
    getGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(userId)),
    getGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION),
  ]);

  const currentVersion = `${userVersion}:${globalCoursesVersion}`;

  // Smart Sync
  if (clientVersion && clientVersion === currentVersion) {
    console.log(
      `[getUserDashboardData] Version match for ${userId}. Returning NOT_MODIFIED.`,
    );
    return { status: "not-modified", version: currentVersion };
  }

  // Check Redis cache (versioned for immediate invalidation)
  const cacheKey = `user:dashboard:${userId}:${currentVersion}`;
  const redisStartTime = Date.now();
  const cached = await getCache<any>(cacheKey);
  console.log(
    `[getUserDashboardData] Redis lookup for User=${userId} took ${Date.now() - redisStartTime}ms. Result: ${cached ? "HIT" : "MISS"}`,
  );

  if (cached) {
    return { data: cached, version: currentVersion };
  }

  const dbStartTime = Date.now();
  try {
    const enrollments = await prisma.enrollment.findMany({
      where: {
        userId,
        status: "Granted",
      },
      include: {
        Course: {
          include: {
            chapter: {
              include: {
                lesson: {
                  select: { id: true, duration: true },
                },
              },
            },
          },
        },
      },
    });

    console.log(
      `[getUserDashboardData] DB Computation took ${Date.now() - dbStartTime}ms`,
    );

    const enrolledCoursesCount = enrollments.length;

    // ✅ Optimization: Fetch ALL user lesson progress in ONE query
    const allProgress = await prisma.lessonProgress.findMany({
      where: { userId },
      select: {
        lessonId: true,
        completed: true,
        actualWatchTime: true,
      },
    });

    // Create a fast lookup map
    const progressMap = new Map(allProgress.map((p) => [p.lessonId, p]));

    // Calculate metrics in memory
    const coursesProgress = enrollments.map((enrollment: any) => {
      const course = enrollment.Course;
      let courseDurationSum = 0;
      let courseRestrictionSum = 0;
      let courseCompletedCount = 0;
      let totalLessons = 0;

      const lessonsProgress: any[] = [];

      course.chapter.forEach((chapter: any) => {
        totalLessons += chapter.lesson.length;
        chapter.lesson.forEach((lesson: any) => {
          const progress = progressMap.get(lesson.id) as any;
          const duration = (lesson.duration || 0) * 60; // Normalize to seconds
          const restriction = progress?.restrictionTime || 0;

          courseDurationSum += duration;
          courseRestrictionSum += Math.min(restriction, duration);

          if (
            progress?.completed ||
            (duration > 0 && restriction >= duration * 0.95)
          ) {
            courseCompletedCount++;
          }

          lessonsProgress.push({
            id: lesson.id,
            duration: lesson.duration || 0,
            restrictionTime: restriction,
            completed: progress?.completed || false,
          });
        });
      });

      const progressPercentage =
        courseDurationSum > 0
          ? Math.round((courseRestrictionSum / courseDurationSum) * 100)
          : totalLessons > 0
            ? Math.round((courseCompletedCount / totalLessons) * 100)
            : 0;

      return {
        id: course.id,
        title: course.title,
        imageUrl: course.fileKey,
        progress: progressPercentage,
        totalLessons,
        completedLessons: courseCompletedCount,
        actualWatchTime: courseRestrictionSum,
        slug: course.slug,
        level: course.level,
        lessonsProgress, // ✅ New: detailed for client-side "real-time" sync
      };
    });

    const completedCoursesCount = coursesProgress.filter(
      (c: any) => c.progress === 100,
    ).length;
    const totalCompletedLessons = coursesProgress.reduce(
      (acc, c) => acc + c.completedLessons,
      0,
    );
    const totalPlatformActualWatchTime = coursesProgress.reduce(
      (acc, c: any) => acc + c.actualWatchTime,
      0,
    );

    // Calculate completed chapters count (In-memory)
    let completedChaptersCount = 0;
    for (const enrollment of enrollments) {
      for (const chapter of enrollment.Course.chapter) {
        const totalLessonsInChapter = chapter.lesson.length;
        if (totalLessonsInChapter === 0) continue;

        const completedInChapter = chapter.lesson.filter(
          (l: any) => progressMap.get(l.id)?.completed,
        ).length;
        if (completedInChapter === totalLessonsInChapter) {
          completedChaptersCount++;
        }
      }
    }

    const result = {
      enrolledCoursesCount,
      completedCoursesCount,
      completedChaptersCount,
      totalCompletedLessons,
      totalPlatformActualWatchTime,
      coursesProgress,
    };

    // Cache in Redis for 30 days
    await setCache(cacheKey, result, 2592000); // 30 days

    return { data: result, version: currentVersion };
  } catch (error) {
    console.error(`[getUserDashboardData] Error:`, error);
    return null;
  }
}
