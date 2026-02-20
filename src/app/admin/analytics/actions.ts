"use server";

import { requireAdmin } from "@/app/data/admin/require-admin";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

import { getCache, setCache, invalidateCache, GLOBAL_CACHE_KEYS, getGlobalVersion, incrementGlobalVersion } from "@/lib/redis";

export async function getAdminAnalytics(startDate?: Date, endDate?: Date, clientVersion?: string) {
    await requireAdmin();

    // Smart Sync: Only compute if version changed (unless custom range is selected)
    // For now, if startDate/endDate is passed, we bypass cache for accurate custom ranges
    const isCustomRange = !!startDate || !!endDate;

    let currentVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION);

    if (currentVersion === "0") {
      console.log(`[getAdminAnalytics] Version key missing. Initializing...`);
      await incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION);
      currentVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION);
    }


  if (!isCustomRange && clientVersion && clientVersion === currentVersion) {
    console.log(`[getAdminAnalytics] Version Match (${clientVersion}). Returning NOT_MODIFIED (Skipping Redis Data Fetch).`);
    return { status: "not-modified", version: currentVersion };
  }

  if (!isCustomRange) {
    console.log(`[getAdminAnalytics] Version Mismatch (Client: ${clientVersion || 'None'}, Server: ${currentVersion}). Checking Redis...`);
  }

    // Check Redis cache for default range
    const cacheKey = GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS;
    if (!isCustomRange) {
        const cached = await getCache<any>(cacheKey);
        if (cached) {
            console.log(`[getAdminAnalytics] Redis Cache HIT. Returning data.`);
            return { data: cached, version: currentVersion };
        }
        console.log(`[getAdminAnalytics] Redis Cache MISS. Fetching from Prisma DB...`);
    }

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
            popularCourses,
            averageProgressData
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
            }),
            getAverageProgressCached()
        ]);

        const enrollRatio = totalUsers > 0 ? Math.round((totalEnrollments / totalUsers) * 100) : 0;

        // --- Chart Data Processing ---
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

        const result = {
            totalUsers,
            totalCourses,
            totalEnrollments,
            totalLessons,
            totalResources,
            averageProgress: averageProgressData.value,
            averageProgressLastUpdated: averageProgressData.lastUpdated,
            enrollRatio,
            recentUsers,
            chartData,
            enrollmentChartData,
            popularCoursesChartData
        };

        // Cache in Redis for 6 hours
        if (!isCustomRange) {
            await setCache(cacheKey, result, 21600);
        }

        return { data: result, version: currentVersion };
    } catch (error) {
        console.error("[getAdminAnalytics Error]", error);
        return null;
    }
}

/**
 * Isolate CPU-intensive Average Progress calculation with 24h caching
 */
async function getAverageProgressCached() {
    const cacheKey = GLOBAL_CACHE_KEYS.ADMIN_AVERAGE_PROGRESS;
    const cached = await getCache<{ value: number; lastUpdated: string }>(cacheKey);

    if (cached) {
        return cached;
    }

    console.log("[getAverageProgressCached] Cache MISS. Computing heavy metrics (24h isolation)...");

    try {
        // --- Optimized Average Progress Calculation (Set-Based) ---
        // We use relation filters to avoid fetching massive ID arrays into memory
        
        // 1. Total Completed Lessons for users with Granted enrollments
        const totalCompleted = await prisma.lessonProgress.count({
            where: {
                completed: true,
                User: {
                    enrollment: {
                        some: { status: "Granted" }
                    }
                }
            }
        });

        // 2. Total Potential Lessons (Sum of lessons across all granted enrollments)
        // Optimized: Instead of manual JS sum, we fetch course lesson counts and enrollment counts
        const coursesWithStats = await prisma.course.findMany({
            select: {
                _count: {
                    select: {
                        enrollment: { where: { status: "Granted" } }
                    }
                },
                chapter: {
                    select: {
                        _count: { select: { lesson: true } }
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

        const result = {
            value: averageProgress,
            lastUpdated: new Date().toISOString()
        };

        // Cache for 24 hours (86400 seconds)
        await setCache(cacheKey, result, 86400);

        return result;
    } catch (error) {
        console.error("[getAverageProgressCached Error]", error);
        return { value: 0, lastUpdated: new Date().toISOString() };
    }
}

import { getUserDashboardData } from "@/app/dashboard/actions";

export async function getUserAnalyticsAdmin(userId: string) {
    await requireAdmin();
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
        return null;
    }
}

export async function getUserCourseDetailedProgress(userId: string, courseId: string) {
    await requireAdmin();
    try {
        const [user, course] = await Promise.all([
            prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, name: true, image: true, email: true, role: true, createdAt: true }
            }),
            prisma.course.findUnique({
                where: { id: courseId },
                include: {
                    chapter: {
                        orderBy: { position: 'asc' },
                        include: {
                            lesson: {
                                orderBy: { position: 'asc' },
                                include: {
                                    lessonProgress: {
                                        where: { userId }
                                    }
                                }
                            }
                        }
                    }
                }
            })
        ]);

        if (!user || !course) return null;

        return { user, course };
    } catch (error) {
        return null;
    }
}

export async function getAllUsers(search?: string, page: number = 1, limit: number = 100, roleFilter?: string) {
    await requireAdmin();
    try {
        const skip = (page - 1) * limit;

        const whereClause: any = {
            AND: []
            };

            if (search) {
            whereClause.AND.push({
                OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { id: { contains: search, mode: 'insensitive' } },
                { phoneNumber: { contains: search, mode: 'insensitive' } },
                ]
            });
            }
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
        return {
            users: [],
            hasNextPage: false,
            totalUsers: 0
        };
    }
}

export async function updateUserRole(userId: string, newRole: string) {
    await requireAdmin();
    try {
        await prisma.user.update({
            where: { id: userId },
            data: { role: newRole },
        });

        revalidatePath("/admin/analytics/users");
        return { success: true };
    } catch (error) {
        return { success: false, error: "Failed to update role" };
    }
}
