"use server";
import { prisma } from "@/lib/db";
import {
  getGlobalVersion,
  GLOBAL_CACHE_KEYS,
  checkRateLimit,
  getOrSetWithStampedePrevention,
} from "@/lib/redis";
import { requireUser } from "../data/user/require-user";

export async function getUserDashboardData(
  clientVersion?: string,
  overriddenUserId?: string,
) {
  try {
    const user = await requireUser();
    const userId = overriddenUserId || user.id;

    // Rate Limit: 30 requests per minute for Dashboard queries
    const rl = await checkRateLimit(
      `action:getUserDashboardData:${userId}`,
      30,
      60,
    );
    if (!rl.success) {
      throw new Error(`Rate limit exceeded. Try again in ${rl.reset} seconds.`);
    }

    const [userVersion, globalCoursesVersion] = await Promise.all([
      getGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(userId)),
      getGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION),
    ]);

    const currentVersion = `${userVersion}:${globalCoursesVersion}`;
    const cacheKey = `user:dashboard:${userId}:${currentVersion}`;

    // Smart Sync
    if (clientVersion && clientVersion === currentVersion) {
      console.log(
        `%c[getUserDashboardData] SERVER HIT: NOT_MODIFIED (${clientVersion}).`,
        "color: #eab308; font-weight: bold",
      );
      return { status: "not-modified", version: currentVersion };
    }

    // Use stampede prevention for the actual data fetching
    const data = await getOrSetWithStampedePrevention(
      cacheKey,
      async () => {
        const dbStartTime = Date.now();
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

        const duration = Date.now() - dbStartTime;
        console.log(
          `%c[getUserDashboardData] DB HIT (${duration}ms).`,
          "color: #eab308; font-weight: bold",
        );

        const enrolledCoursesCount = enrollments.length;

        // ✅ Optimization: Fetch ALL user lesson progress in ONE query
        const allProgress = await prisma.lessonProgress.findMany({
          where: { userId },
          select: {
            lessonId: true,
            completed: true,
            actualWatchTime: true,
            restrictionTime: true,
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
              const duration = (lesson.duration || 0); // Already in seconds (normalized by client/form)
              const restriction = progress?.restrictionTime || 0;

              courseDurationSum += duration;
              courseRestrictionSum += Math.min(restriction, duration);

              if (
                progress?.completed ||
                (duration > 0 && restriction >= duration * 0.9)
              ) {
                courseCompletedCount++;
              }

              lessonsProgress.push({
                id: lesson.id,
                duration: (lesson.duration || 0), // Already in seconds
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

        return {
          enrolledCoursesCount,
          completedCoursesCount,
          completedChaptersCount,
          totalCompletedLessons,
          totalPlatformActualWatchTime,
          coursesProgress,
        };
      },
      2592000, // 30 days
    );

    return { data, version: currentVersion };
  } catch (error) {
    console.error(`[getUserDashboardData] Error:`, error);
    return null;
  }
}
