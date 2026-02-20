"use server";

import { requireAdmin } from "@/app/data/admin/require-admin";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getCache, setCache, GLOBAL_CACHE_KEYS, getGlobalVersion, incrementGlobalVersion, invalidateCache } from "@/lib/redis";

export async function getAdminAnalytics(startDate?: Date, endDate?: Date, clientVersion?: string) {
    await requireAdmin();

    const isCustomRange = !!startDate || !!endDate;
    let currentVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION);

    if (!currentVersion || currentVersion === "null") {
        await incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION);
        currentVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION);
    }

    if (!isCustomRange && clientVersion && clientVersion === currentVersion) {
        console.log(`[getAdminAnalytics] Version Match (${clientVersion}). Returning NOT_MODIFIED.`);
        return { status: "not-modified", version: currentVersion };
    }

    const cacheKey = GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS;
    if (!isCustomRange) {
        const cached = await getCache<any>(cacheKey);
        if (cached) {
            console.log(`[getAdminAnalytics] Redis Cache HIT. Returning data.`);
            return { data: cached, version: currentVersion };
        }
    }

    try {
        const IST_TZ = 'Asia/Kolkata';
        const now = new Date();
        
        // Target dates from parameters or default
        const startRaw = startDate ? new Date(startDate) : new Date(new Date().setDate(now.getDate() - 7));
        const endRaw = endDate ? new Date(endDate) : now;

        // Helper to get exact UTC moment for IST day boundaries
        const getISTDayBoundary = (date: Date, type: 'start' | 'end') => {
            const dateString = new Intl.DateTimeFormat("en-CA", { timeZone: IST_TZ }).format(date);
            const timeString = type === 'start' ? '00:00:00.000' : '23:59:59.999';
            // IST is UTC+5:30, so YYYY-MM-DDTHH:mm:ss.sss+05:30 correctly identifies the moment
            return new Date(`${dateString}T${timeString}+05:30`);
        };

        const normalizedStart = getISTDayBoundary(startRaw, 'start');
        const normalizedEnd = getISTDayBoundary(endRaw, 'end');

        console.log(`[getAdminAnalytics] Range (IST): ${normalizedStart.toLocaleString('en-IN', { timeZone: IST_TZ })} to ${normalizedEnd.toLocaleString('en-IN', { timeZone: IST_TZ })}`);
        console.log(`[getAdminAnalytics] Range (UTC): ${normalizedStart.toISOString()} to ${normalizedEnd.toISOString()}`);

        const startTime = Date.now();
        const [
            userGrowth,
            totalUsers,
            totalEnrollments,
            totalCourses,
            totalLessons,
            recentUsers,
            enrollmentStats,
            courseEnrollment,
            lessonCompletionData,
            totalResources,
            averageProgressData
        ] = await Promise.all([
            prisma.user.findMany({
                where: { createdAt: { gte: normalizedStart, lte: normalizedEnd } },
                select: { createdAt: true },
            }),
            prisma.user.count(),
            prisma.enrollment.count(),
            prisma.course.count(),
            prisma.lesson.count(),
            prisma.user.findMany({
                orderBy: { createdAt: "desc" },
                take: 5,
                select: { id: true, name: true, email: true, image: true, createdAt: true },
            }),
            prisma.enrollment.groupBy({
                by: ["status"],
                _count: { _all: true },
            }),
            prisma.enrollment.groupBy({
                by: ["courseId"],
                _count: { _all: true },
                orderBy: { _count: { courseId: "desc" } },
                take: 5,
            }),
            prisma.lessonProgress.aggregate({
                where: { completed: true },
                _count: { completed: true },
            }),
            prisma.notification.count({
                where: { fileUrl: { not: null } }
            }),
            getAverageProgressCached()
        ]);

        const mainDuration = Date.now() - startTime;
        console.log(`[getAdminAnalytics] Main DB Queries took ${mainDuration}ms`);

        const enrollRatio = totalUsers > 0 ? Math.round((totalEnrollments / totalUsers) * 100) : 0;

        // 6. Process Chart Data (Registrations by Day - IST Grouped)
        const getISTDateKey = (date: Date) => {
            return new Intl.DateTimeFormat("en-CA", { timeZone: IST_TZ }).format(date); // YYYY-MM-DD
        };

        const growthMap = new Map<string, number>();
        userGrowth.forEach((u) => {
            const key = getISTDateKey(u.createdAt);
            growthMap.set(key, (growthMap.get(key) || 0) + 1);
        });

        const diffTime = Math.abs(normalizedEnd.getTime() - normalizedStart.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        const chartData = [];
        for (let i = 0; i <= diffDays; i++) {
            const d = new Date(normalizedStart);
            d.setDate(normalizedStart.getDate() + i);
            const key = getISTDateKey(d);
            
            if (key <= getISTDateKey(normalizedEnd)) {
                chartData.push({
                    name: key,
                    value: growthMap.get(key) || 0,
                });
            }
        }

        const enrollmentChartData = enrollmentStats.map((item) => ({
            name: item.status,
            value: item._count._all
        }));

        const courseIds = courseEnrollment.map(p => p.courseId);
        const coursesDetails = await prisma.course.findMany({
            where: { id: { in: courseIds } },
            select: { id: true, title: true }
        });

        const popularCoursesChartData = courseEnrollment.map((p) => {
            const course = coursesDetails.find((c) => c.id === p.courseId);
            return {
                name: course?.title || 'Unknown',
                value: p._count._all
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

        if (!isCustomRange) {
            await setCache(cacheKey, result, 2592000);
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

  // 1️⃣ Check cache first
  const cached = await getCache<{ value: number; lastUpdated: string }>(cacheKey);
  if (cached) {
    return cached;
  }

  const startTime = Date.now();

  try {
    // 2️⃣ Run all counts in parallel (faster)
    const [totalCompleted, totalGrantedEnrollments, totalLessons] =
      await Promise.all([
        prisma.lessonProgress.count({
          where: {
            completed: true,
            User: {
              enrollment: {
                some: { status: "Granted" }
              }
            }
          }
        }),
        prisma.enrollment.count({
          where: { status: "Granted" }
        }),
        prisma.lesson.count()
      ]);

    const totalPotential = totalLessons * totalGrantedEnrollments;

    const averageProgress =
      totalPotential > 0
        ? Math.round((totalCompleted / totalPotential) * 100)
        : 0;

    const result = {
      value: averageProgress,
      lastUpdated: new Date().toISOString()
    };

    // 3️⃣ Cache for 24 hours (86400 seconds)
    await setCache(cacheKey, result, 86400);

    console.log(
      `[AverageProgress OPTIMIZED] Computed + Cached in ${
        Date.now() - startTime
      }ms`
    );

    return result;
  } catch (error) {
    console.error("[getAverageProgressCached Error]", error);
    return {
      value: 0,
      lastUpdated: new Date().toISOString()
    };
  }
}

import { getUserDashboardData } from "@/app/dashboard/actions";

export async function getUserAnalyticsAdmin(userId: string, clientVersion?: string) {
    await requireAdmin();
    try {
        const [userVersion, globalCoursesVersion] = await Promise.all([
            getGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(userId)),
            getGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION)
        ]);
        
        const currentVersion = `${userVersion}:${globalCoursesVersion}`;

        // Smart Sync
        if (clientVersion && clientVersion === currentVersion) {
            console.log(`[getUserAnalyticsAdmin] Version match for ${userId}. Returning NOT_MODIFIED.`);
            return { status: "not-modified", version: currentVersion };
        }

        const startTime = Date.now();
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, email: true, role: true, createdAt: true, image: true }
        });
        const duration = Date.now() - startTime;
        console.log(`[getUserAnalyticsAdmin] DB Fetch took ${duration}ms for User ID: ${userId}`);

        if (!user) return null;

        // Reuse the logic from getUserDashboardData but maybe add more details if needed
        const dashboardData = await getUserDashboardData(userId);

        if (!dashboardData) return null;

        return {
            user,
            ...dashboardData,
            version: currentVersion
        };

    } catch (error) {
        return null;
    }
}

export async function getUserCourseDetailedProgress(userId: string, courseId: string) {
    await requireAdmin();
    try {
        const startTime = Date.now();
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
        const duration = Date.now() - startTime;
        console.log(`[getUserCourseDetailedProgress] DB Fetch took ${duration}ms for User ID: ${userId}, Course ID: ${courseId}`);

        if (!user || !course) return null;

        return { user, course };
    } catch (error) {
        return null;
    }
}

export async function getAllUsers(search?: string, page: number = 1, limit: number = 100, roleFilter?: string, clientVersion?: string) {
    await requireAdmin();
    try {
        const isDefaultFetch = page === 1 && limit === 100 && !search && (roleFilter === 'user' || roleFilter === 'admin');
        let currentVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_USERS_VERSION);

        if (currentVersion === "0") {
            await incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_USERS_VERSION);
            currentVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_USERS_VERSION);
        }

        const cacheKey = roleFilter === 'admin' 
            ? "admin:admins:list" // New key for admins
            : GLOBAL_CACHE_KEYS.ADMIN_USERS_LIST;

        // 1. Version Match check
        if (isDefaultFetch && clientVersion && clientVersion === currentVersion) {
            console.log(`[getAllUsers] Version Match (${clientVersion}) for ${roleFilter}. Returning NOT_MODIFIED.`);
            return { status: "not-modified", version: currentVersion };
        }

        // 2. Global List Cache
        if (isDefaultFetch) {
            const cached = await getCache<any>(cacheKey);
            if (cached) {
                console.log(`[getAllUsers] Redis ${roleFilter} List Cache HIT. Returning data.`);
                return { ...cached, version: currentVersion };
            }
            console.log(`[getAllUsers] Redis ${roleFilter} List Cache MISS. Fetching from DB...`);
        }

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

        const startTime = Date.now();
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
        const duration = Date.now() - startTime;
        console.log(`[getAllUsers] DB Fetch (List + Count) took ${duration}ms. Filters: ${JSON.stringify(whereClause)}`);

        const hasNextPage = skip + users.length < totalUsers;

        const result = {
            users,
            hasNextPage,
            totalUsers,
            version: currentVersion
        };

        // Cache default list
        if (isDefaultFetch) {
            await setCache(cacheKey, { users, hasNextPage, totalUsers }, 2592000);
        }

        return result;
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

        // Invalidate cache
        await Promise.all([
            invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_USERS_LIST),
            invalidateCache("admin:admins:list"), // Also invalidate admins list
            incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_USERS_VERSION),
            // Invalidate specifically for this user
            incrementGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(userId)),
            invalidateCache(`user:dashboard:${userId}`),
            // Invalidate global analytics as user counts/roles might affect metrics
            incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION),
            incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_VERSION),
        ]);

        revalidatePath("/admin/analytics/users");
        revalidatePath(`/admin/analytics/users/${userId}`);
        revalidatePath("/admin/analytics");
        return { success: true };
    } catch (error) {
        return { success: false, error: "Failed to update role" };
    }
}
