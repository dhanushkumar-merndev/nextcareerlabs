"use server";

import { prisma } from "@/lib/db";

// Fallback if needed, but implicit any fixes below
interface ChartData {
    name: string;
    value: number;
}

export async function getAdminAnalytics(startDate?: Date, endDate?: Date) {
  try {
    const totalUsers = await prisma.user.count();
    const totalEnrollments = await prisma.enrollment.count({
      where: { status: "Granted" },
    });
    const enrollRatio = totalUsers > 0 ? Math.round((totalEnrollments / totalUsers) * 100) : 0;

    const totalCourses = await prisma.course.count({
      where: { status: "Published" },
    });
    const totalLessons = await prisma.lesson.count();

    const totalResources = await prisma.notification.count({
        where: { fileUrl: { not: null } }
    });

    // Calculate Average Progress across all granted enrollments
    const grantedEnrollments = await prisma.enrollment.findMany({
        where: { status: "Granted" },
        include: {
            Course: {
                include: {
                    chapter: {
                        include: {
                            lesson: {
                                select: { id: true }
                            }
                        }
                    }
                }
            }
        }
    });

    let totalCompleted = 0;
    let totalPotential = 0;

    for (const enrollment of grantedEnrollments) {
        const totalLessonsInCourse = enrollment.Course.chapter.reduce((acc: number, chap: any) => acc + chap.lesson.length, 0);
        
        const completedCount = await prisma.lessonProgress.count({
            where: {
                userId: enrollment.userId,
                completed: true,
                Lesson: {
                    Chapter: {
                        courseId: enrollment.courseId
                    }
                }
            }
        });

        totalCompleted += completedCount;
        totalPotential += totalLessonsInCourse;
    }

    const averageProgress = totalPotential > 0
        ? Math.round((totalCompleted / totalPotential) * 100)
        : 0;

    const recentUsers = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 7,
    });

    // Chart Data: Users created in range
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date();
    
    if (!startDate) {
        start.setDate(end.getDate() - 7);
    }

    // Normalize start to beginning of day and end to end of day
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    
    const usersInRange = await prisma.user.findMany({
        where: { createdAt: { gte: start, lte: end } },
        select: { createdAt: true },
    });

    // Calculate number of days between start and end accurately
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); 

    const chartData = Array.from({ length: diffDays + 1 }, (_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        d.setHours(0, 0, 0, 0);
        
        const count = usersInRange.filter((u: { createdAt: Date }) => {
            const userDate = new Date(u.createdAt);
            userDate.setHours(0, 0, 0, 0);
            return userDate.getTime() === d.getTime();
        }).length;

        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dayStr = `${year}-${month}-${day}`;

        return { name: dayStr, value: count };
    });


    // Chart Data: Enrollments Status
    const enrollmentCounts = await prisma.enrollment.groupBy({
        by: ['status'],
        _count: { status: true }
    });
    
    const enrollmentChartData = enrollmentCounts.map((item: { status: string, _count: { status: number } }) => ({
        name: item.status,
        value: item._count.status
    }));

     // Top 5 Popular Courses
     const popularCourses = await prisma.enrollment.groupBy({
        by: ['courseId'],
        _count: { courseId: true },
        orderBy: { _count: { courseId: 'desc' } },
        take: 5
    });

    const coursesDetails = await prisma.course.findMany({
        where: { id: { in: popularCourses.map((p: { courseId: string }) => p.courseId) } },
        select: { id: true, title: true }
    });

    const popularCoursesChartData = popularCourses.map((p: { courseId: string; _count: { courseId: number } }) => {
        const course = coursesDetails.find((c: { id: string }) => c.id === p.courseId);
        return {
            name: course?.title || 'Unknown',
            value: p._count.courseId
        };
    });


    return {
      totalUsers,
      totalCourses,
      totalEnrollments,
      totalLessons,
      totalResources,
      averageProgress,
      totalCompletedLessons: totalCompleted,
      totalPotentialLessons: totalPotential,
      enrollRatio,
      recentUsers,
      chartData,
      enrollmentChartData,
      popularCoursesChartData
    };
  } catch (error) {
    console.error("Error fetching admin analytics:", error);
    return null;
  }
}

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

export async function getUserAnalyticsAdmin(userId: string) {
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, email: true, role: true, createdAt: true, image: true }
        });

        if (!user) return null;

        // Reuse the logic from getUserDashboardData but maybe add more details if needed
        const dashboardData = await getUserDashboardData(userId);
        
        if (!dashboardData) return null;

        return {
            user,
            ...dashboardData
        };

    } catch (error) {
        console.error("Error fetching user admin analytics:", error);
        return null;
    }
}

export async function getAllUsers(search?: string, page: number = 1, limit: number = 100, roleFilter?: string) {
    try {
        const skip = (page - 1) * limit;

        const users = await prisma.user.findMany({
            where: {
                AND: [
                    roleFilter === 'admin' 
                        ? { role: 'admin' } 
                        : roleFilter === 'user' 
                            ? { role: { not: 'admin' } } // Assuming non-admins are users. Could also be { role: null } OR { role: 'user' } depending on schema. simpler to say not admin.
                            : {}, // 'all' or undefined
                    {
                        OR: [
                            { name: { contains: search, mode: 'insensitive' } },
                            { email: { contains: search, mode: 'insensitive' } },
                            { id: { contains: search, mode: 'insensitive' } },
                            { phoneNumber: { contains: search, mode: 'insensitive' } },
                        ]
                    }
                ]
            },
            orderBy: { createdAt: 'desc' },
            select: { 
                id: true, 
                name: true, 
                email: true, 
                role: true, 
                createdAt: true, 
                image: true,
                phoneNumber: true,
                _count: {
                    select: { enrollment: true }
                }
            },
            take: limit,
            skip: skip
        });

        const totalUsers = await prisma.user.count({
            where: {
                AND: [
                    roleFilter === 'admin' 
                        ? { role: 'admin' } 
                        : roleFilter === 'user' 
                            ? { role: { not: 'admin' } }
                            : {},
                    {
                        OR: [
                            { name: { contains: search, mode: 'insensitive' } },
                            { email: { contains: search, mode: 'insensitive' } },
                            { id: { contains: search, mode: 'insensitive' } },
                            { phoneNumber: { contains: search, mode: 'insensitive' } },
                        ]
                    }
                ]
            }
        });

        const hasNextPage = skip + users.length < totalUsers;

        return {
            users,
            hasNextPage,
            totalUsers
        };
    } catch (error) {
        console.error("Error fetching all users:", error);
        return {
            users: [],
            hasNextPage: false,
            totalUsers: 0
        };
    }
}
