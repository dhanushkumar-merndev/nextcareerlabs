"use server";

import { prisma } from "@/lib/db";



export async function getAdminAnalytics(startDate?: Date, endDate?: Date) {
  try {
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date();
    
    if (!startDate) {
        start.setDate(end.getDate() - 7);
    }
    // Normalize start to beginning of day and end to end of day
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const [
        totalUsers,
        totalEnrollments,
        totalCourses,
        totalLessons,
        totalResources,
        recentUsers,
        joinedUsersInRange,
        enrollmentCounts,
        popularCourses
    ] = await Promise.all([
        prisma.user.count(),
        prisma.enrollment.count({ where: { status: "Granted" } }),
        prisma.course.count({ where: { status: "Published" } }),
        prisma.lesson.count(),
        prisma.notification.count({ where: { fileUrl: { not: null } } }),
        prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
        // Check users created in range for chart
        prisma.user.findMany({
            where: { createdAt: { gte: start, lte: end } },
            select: { createdAt: true },
        }),
        // Enrollment status counts
        prisma.enrollment.groupBy({
            by: ['status'],
            _count: { status: true }
        }),
        // Popular courses (raw)
        prisma.enrollment.groupBy({
            by: ['courseId'],
            _count: { courseId: true },
            orderBy: { _count: { courseId: 'desc' } },
            take: 5
        })
    ]);

    const enrollRatio = totalUsers > 0 ? Math.round((totalEnrollments / totalUsers) * 100) : 0;

    // --- Optimized Average Progress Calculation ---
    // Success Rate = (Total Completed Lessons by Enrolled Users) / (Total Users × Total Lessons)
    // Example: 10 users, 2 lessons
    //   - 5 users completed both lessons = 10 completed
    //   - 5 users completed 1 lesson = 5 completed
    //   - Total completed = 15
    //   - Total possible = 10 × 2 = 20
    //   - Success rate = 15/20 = 75%
    
    // 1. Total Completed Lessons (only for users with granted enrollments)
    // Get all users who have at least one granted enrollment
    const usersWithGrantedEnrollment = await prisma.enrollment.findMany({
        where: { status: "Granted" },
        select: { userId: true },
        distinct: ['userId']
    });
    
    const grantedUserIds = usersWithGrantedEnrollment.map(e => e.userId);
    
    // Count completed lessons only for these users
    const totalCompleted = await prisma.lessonProgress.count({
        where: { 
            completed: true,
            userId: { in: grantedUserIds }
        }
    });

    // 2. Total Potential Lessons
    // We need sum of (Lessons in Course * Granted Enrollments for that Course)
    const coursesWithStats = await prisma.course.findMany({
        select: {
            id: true,
            _count: {
                select: { 
                    enrollment: { where: { status: "Granted" } } // Count granted enrollments
                }
            },
            chapter: {
                select: {
                    _count: { select: { lesson: true } } // Count lessons per chapter
                }
            }
        }
    });

    let totalPotential = 0;
    coursesWithStats.forEach(course => {
        const lessonsInCourse = course.chapter.reduce((sum, chap) => sum + chap._count.lesson, 0);
        const grantedEnrollments = course._count.enrollment;
        totalPotential += (lessonsInCourse * grantedEnrollments);
    });

    const averageProgress = totalPotential > 0
        ? Math.round((totalCompleted / totalPotential) * 100)
        : 0;
    
    // --- Chart Data Processing ---

    // 1. User Growth Chart
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); 

    const chartData = Array.from({ length: diffDays + 1 }, (_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        
        const count = joinedUsersInRange.filter((u) => {
            const userDate = new Date(u.createdAt);
            return userDate.getDate() === d.getDate() && 
                   userDate.getMonth() === d.getMonth() && 
                   userDate.getFullYear() === d.getFullYear();
        }).length;

        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return { name: `${year}-${month}-${day}`, value: count };
    });

    // 2. Enrollment Status Chart
    const enrollmentChartData = enrollmentCounts.map((item) => ({
        name: item.status,
        value: item._count.status
    }));

    // 3. Popular Courses Chart
    // Fetch titles for the popular courses found
    const courseIds = popularCourses.map(p => p.courseId);
    const coursesDetails = await prisma.course.findMany({
        where: { id: { in: courseIds } },
        select: { id: true, title: true }
    });

    const popularCoursesChartData = popularCourses.map((p) => {
        const course = coursesDetails.find((c) => c.id === p.courseId);
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

        const whereClause: any = {
            AND: [
                {
                    OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { email: { contains: search, mode: 'insensitive' } },
                        { id: { contains: search, mode: 'insensitive' } },
                        { phoneNumber: { contains: search, mode: 'insensitive' } },
                    ]
                }
            ]
        };

        // Strict role filtering with case insensitivity
        if (roleFilter === 'admin') {
            whereClause.AND.push({ 
                role: { equals: 'admin', mode: 'insensitive' } 
            });
        } else if (roleFilter === 'user') {
            whereClause.AND.push({
                OR: [
                    { role: null },
                    { NOT: { role: { equals: 'admin', mode: 'insensitive' } } }
                ]
            });
        }

        const users = await prisma.user.findMany({
            where: whereClause,
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
            where: whereClause
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
