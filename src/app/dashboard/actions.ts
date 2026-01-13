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
                imageUrl: course.fileKey, // Assuming thumbnail is fileKey for now or derive it
                progress,
                totalLessons,
                completedLessons,
                slug: course.slug
            };
        }));

        const completedCoursesCount = coursesProgress.filter((c: any) => c.progress === 100).length;

        return {
            enrolledCoursesCount,
            completedCoursesCount,
            coursesProgress
        };
    } catch (error) {
        console.error("Error fetching user dashboard data:", error);
        return null;
    }
}
