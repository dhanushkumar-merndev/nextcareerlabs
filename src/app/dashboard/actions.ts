"use server";

import { prisma } from "@/lib/db";
import { getCache, setCache, GLOBAL_CACHE_KEYS, getGlobalVersion } from "@/lib/redis";

export async function getUserDashboardData(userId: string, clientVersion?: string) {
    const [userVersion, globalCoursesVersion] = await Promise.all([
        getGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(userId)),
        getGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION)
    ]);
    
    const currentVersion = `${userVersion}:${globalCoursesVersion}`;

    // Smart Sync
    if (clientVersion && clientVersion === currentVersion) {
        console.log(`[getUserDashboardData] Version match for ${userId}. Returning NOT_MODIFIED.`);
        return { status: "not-modified", version: currentVersion };
    }

    // Check Redis cache
    const cacheKey = `user:dashboard:${userId}`;
    const cached = await getCache<any>(cacheKey);
    if (cached) {
        console.log(`[Redis] Cache HIT for dashboard data: ${userId}`);
        return { ...cached, version: currentVersion };
    }

    try {
        const enrollments = await prisma.enrollment.findMany({
            where: {
                userId,
                status: "Granted"
            },
            include: {
                Course: {
                    include: {
                        chapter: {
                            include: {
                                lesson: true
                            }
                        }
                    }
                }
            }
        });

        const enrolledCoursesCount = enrollments.length;

        // Calculate progress for each course
        const coursesProgress = await Promise.all(enrollments.map(async (enrollment: any) => {
            const course = enrollment.Course;
            const totalLessons = course.chapter.reduce((acc: number, chapter: any) => acc + chapter.lesson.length, 0);

            const completedLessonsData = await prisma.lessonProgress.findMany({
                where: {
                    userId,
                    Lesson: {
                        Chapter: {
                            courseId: course.id
                        }
                    }
                },
                select: {
                    completed: true,
                    actualWatchTime: true
                }
            });

            const completedLessonsCount = completedLessonsData.filter(lp => lp.completed).length;
            const actualWatchTime = completedLessonsData.reduce((acc, lp) => acc + (lp.actualWatchTime || 0), 0);
            const progress = totalLessons > 0 ? Math.round((completedLessonsCount / totalLessons) * 100) : 0;

            return {
                id: course.id,
                title: course.title,
                imageUrl: course.fileKey, 
                progress,
                totalLessons,
                completedLessons: completedLessonsCount,
                actualWatchTime,
                slug: course.slug,
                level: course.level
            };
        }));

        const completedCoursesCount = coursesProgress.filter((c: any) => c.progress === 100).length;
        const totalCompletedLessons = coursesProgress.reduce((acc, c) => acc + c.completedLessons, 0);
        const totalPlatformActualWatchTime = coursesProgress.reduce((acc, c: any) => acc + c.actualWatchTime, 0);

        // Calculate completed chapters count (Optimized)
        let completedChaptersCount = 0;
        for (const enrollment of enrollments) {
            for (const chapter of enrollment.Course.chapter) {
                const totalLessonsInChapter = chapter.lesson.length;
                if (totalLessonsInChapter === 0) continue;

                // Optimization: Filter from already fetched lessons data if possible, 
                // but for now let's keep the logic simple
                const completedLessonsInChapter = await prisma.lessonProgress.count({
                    where: {
                        userId,
                        completed: true,
                        lessonId: { in: chapter.lesson.map((l: any) => l.id) }
                    }
                });

                if (completedLessonsInChapter === totalLessonsInChapter) {
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
            coursesProgress
        };

        // Cache in Redis for 6 hours
        await setCache(cacheKey, result, 21600);

        return { ...result, version: currentVersion };
    } catch (error) {
        return null;
    }
}
