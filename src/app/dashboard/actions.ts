"use server";

import { prisma } from "@/lib/db";

export async function getUserDashboardData(userId: string) {
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

            const completedLessons = await prisma.lessonProgress.count({
                where: {
                    userId,
                    completed: true,
                    Lesson: {
                        Chapter: {
                            courseId: course.id
                        }
                    }
                }
            });

            const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

            return {
                id: course.id,
                title: course.title,
                imageUrl: course.fileKey, 
                progress,
                totalLessons,
                completedLessons,
                slug: course.slug,
                level: course.level
            };
        }));

        const completedCoursesCount = coursesProgress.filter((c: any) => c.progress === 100).length;
        const totalCompletedLessons = coursesProgress.reduce((acc, c) => acc + c.completedLessons, 0);

        // Calculate completed chapters count
        let completedChaptersCount = 0;
        for (const enrollment of enrollments) {
            for (const chapter of enrollment.Course.chapter) {
                const totalLessonsInChapter = chapter.lesson.length;
                if (totalLessonsInChapter === 0) continue;

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

        return {
            enrolledCoursesCount,
            completedCoursesCount,
            completedChaptersCount,
            totalCompletedLessons,
            coursesProgress
        };
    } catch (error) {
        return null;
    }
}
