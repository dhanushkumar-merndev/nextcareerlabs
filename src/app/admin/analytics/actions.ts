"use server";

import { requireAdmin } from "@/app/data/admin/require-admin";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import {
  getCache,
  setCache,
  GLOBAL_CACHE_KEYS,
  getGlobalVersion,
  incrementGlobalVersion,
  incrementGlobalVersionDebounced,
  invalidateCache,
  withCache,
  checkRateLimit,
  getOrSetWithStampedePrevention,
} from "@/lib/redis";

export async function getAdminAnalytics(
  startDate?: Date,
  endDate?: Date,
  clientVersion?: string,
) {
  console.log(
    `[AdminAnalyticsAction] Fetching analytics (Range: ${startDate || "default"} to ${endDate || "default"}, ClientVersion: ${clientVersion || "none"})`,
  );
  const session = await requireAdmin();
  
  // Rate Limit: 30 requests per minute for Dashboard queries
  const rl = await checkRateLimit(`action:getAdminAnalytics:${session.user.id}`, 30, 60);
  if (!rl.success) {
    throw new Error(`Rate limit exceeded. Try again in ${rl.reset} seconds.`);
  }

  const isCustomRange = !!startDate || !!endDate;
  const cacheKey = `${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:chart`;
  let currentVersion = await getGlobalVersion(
    GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION,
  );

  if (!currentVersion || currentVersion === "null") {
    // 🛡️ [Million-User Scale] Debounced invalidation for initial setup
    await incrementGlobalVersionDebounced(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION, 60);
    currentVersion = await getGlobalVersion(
      GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION,
    );
  }

  if (!isCustomRange && clientVersion && clientVersion === currentVersion) {
    console.log(
      `%c[getAdminAnalytics] SERVER HIT: NOT_MODIFIED (${clientVersion}).`,
      "color: #eab308; font-weight: bold",
    );
    return { status: "not-modified", version: currentVersion };
  }

  if (!isCustomRange) {
    const redisStartTime = Date.now();
    const cached = await getCache<any>(cacheKey);
    const redisDuration = Date.now() - redisStartTime;
    if (cached) {
      console.log(
        `%c[getAdminAnalytics] REDIS HIT (${redisDuration}ms). Version: ${currentVersion}`,
        "color: #eab308; font-weight: bold",
      );
      return { data: cached, version: currentVersion };
    }
  }

  try {
    const IST_TZ = "Asia/Kolkata";
    const now = new Date();

    // Target dates from parameters or default
    const startRaw = startDate
      ? new Date(startDate)
      : new Date(new Date().setDate(now.getDate() - 7));
    const endRaw = endDate ? new Date(endDate) : now;

    // Helper to get exact UTC moment for IST day boundaries
    const getISTDayBoundary = (date: Date, type: "start" | "end") => {
      const dateString = new Intl.DateTimeFormat("en-CA", {
        timeZone: IST_TZ,
      }).format(date);
      const timeString = type === "start" ? "00:00:00.000" : "23:59:59.999";
      // IST is UTC+5:30, so YYYY-MM-DDTHH:mm:ss.sss+05:30 correctly identifies the moment
      return new Date(`${dateString}T${timeString}+05:30`);
    };

    const normalizedStart = getISTDayBoundary(startRaw, "start");
    const normalizedEnd = getISTDayBoundary(endRaw, "end");

    console.log(
      `[getAdminAnalytics] Range (IST): ${normalizedStart.toLocaleString("en-IN", { timeZone: IST_TZ })} to ${normalizedEnd.toLocaleString("en-IN", { timeZone: IST_TZ })}`,
    );
    console.log(
      `[getAdminAnalytics] Range (UTC): ${normalizedStart.toISOString()} to ${normalizedEnd.toISOString()}`,
    );

    const startTime = Date.now();
    const [userGrowth] = await Promise.all([
      prisma.user.findMany({
        where: { createdAt: { gte: normalizedStart, lte: normalizedEnd } },
        select: { createdAt: true },
      }),
    ]);

    const mainDuration = Date.now() - startTime;
    console.log(
      `%c[getAdminAnalytics] DB HIT (${mainDuration}ms). Range: ${normalizedStart.toISOString()} to ${normalizedEnd.toISOString()}`,
      "color: #eab308; font-weight: bold",
    );

    // 6. Process Chart Data (Registrations by Day - IST Grouped)
    const getISTDateKey = (date: Date) => {
      return new Intl.DateTimeFormat("en-CA", { timeZone: IST_TZ }).format(
        date,
      ); // YYYY-MM-DD
    };

    const growthMap = new Map<string, number>();
    userGrowth.forEach((u) => {
      const key = getISTDateKey(u.createdAt);
      growthMap.set(key, (growthMap.get(key) || 0) + 1);
    });

    const diffTime = Math.abs(
      normalizedEnd.getTime() - normalizedStart.getTime(),
    );
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

    const enrollmentChartData = []; // Removed from here
    const popularCoursesChartData = []; // Removed from here

    const result = {
      chartData,
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
 * Dedicated action for Global Stats (Total counts, pie charts, recent users)
 * Highly cached and NOT date-range dependent for the Growth Chart
 */
export async function getAdminStaticAnalytics(clientVersion?: string) {
  console.log(
    `[AdminAnalyticsAction] Fetching static analytics (ClientVersion: ${clientVersion || "none"})`,
  );
  const session = await requireAdmin();

  const rl = await checkRateLimit(`action:getAdminStaticAnalytics:${session.user.id}`, 30, 60);
  if (!rl.success) {
    throw new Error(`Rate limit exceeded. Try again in ${rl.reset} seconds.`);
  }

  let currentVersion = await getGlobalVersion(
    GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION,
  );

  if (clientVersion && clientVersion === currentVersion) {
    return { status: "not-modified", version: currentVersion };
  }

  const cacheKey = `${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:static`;
  
  // Use stampede prevention for the heavy DB fetch if cache is missing
  return await getOrSetWithStampedePrevention(
    cacheKey,
    async () => {
      const startTime = Date.now();
      const [
        totalUsers,
        totalEnrollments,
        totalCourses,
        totalLessons,
        recentUsers,
        enrollmentStats,
        courseEnrollment,
        totalImages,
        totalPdfs,
        totalChapters,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({
          where: {
            enrollment: {
              some: {
                status: "Granted",
              },
            },
          },
        }),
        prisma.course.count(),
        prisma.lesson.count(),
        prisma.user.findMany({
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            createdAt: true,
          },
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
        prisma.notification.count({
          where: { imageUrl: { not: null } },
        }),
        prisma.notification.count({
          where: { fileUrl: { not: null } },
        }),
        prisma.chapter.count(),
      ]);

      const enrollRatio =
        totalUsers > 0 ? Math.round((totalEnrollments / totalUsers) * 100) : 0;

      const enrollmentChartData = enrollmentStats.map((item) => ({
        name: item.status,
        value: item._count._all,
      }));

      const courseIds = courseEnrollment.map((p) => p.courseId);
      const coursesDetails = await prisma.course.findMany({
        where: { id: { in: courseIds } },
        select: { id: true, title: true },
      });

      const popularCoursesChartData = courseEnrollment.map((p) => {
        const course = coursesDetails.find((c) => c.id === p.courseId);
        return {
          name: course?.title || "Unknown",
          value: p._count._all,
        };
      });

      const result = {
        totalUsers,
        totalCourses,
        totalEnrollments,
        totalLessons,
        totalChapters,
        totalImages,
        totalPdfs,
        enrollRatio,
        recentUsers,
        enrollmentChartData,
        popularCoursesChartData,
      };

      const dbDuration = Date.now() - startTime;
      console.log(
        `%c[getAdminStaticAnalytics] DB HIT (${dbDuration}ms).`,
        "color: #eab308; font-weight: bold",
      );

      return result;
    },
    2592000, // 30 days
  ).then(data => ({ data, version: currentVersion }));
}

/**
 * Dedicated action for Success Rate (Average Progress)
 * Isolated because it's CPU-intensive and cached for 24h
 */
export async function getAdminSuccessRate() {
  console.log(`[AdminAnalyticsAction] Calculating platform success rate`);
  const session = await requireAdmin();

  const rl = await checkRateLimit(`action:getAdminSuccessRate:${session.user.id}`, 30, 60);
  if (!rl.success) {
    throw new Error(`Rate limit exceeded. Try again in ${rl.reset} seconds.`);
  }

  return await getAverageProgressCached();
}

/**
 * Isolate CPU-intensive Average Progress calculation with 24h caching
 */
async function getAverageProgressCached() {
  const cacheKey = GLOBAL_CACHE_KEYS.ADMIN_AVERAGE_PROGRESS;

  return await getOrSetWithStampedePrevention(
    cacheKey,
    async () => {
      const startTime = Date.now();
      const [totalCompleted, totalGrantedEnrollments, totalLessons] =
        await Promise.all([
          prisma.lessonProgress.count({
            where: {
              completed: true,
              User: {
                enrollment: {
                  some: { status: "Granted" },
                },
              },
            },
          }),
          prisma.enrollment.count({
            where: { status: "Granted" },
          }),
          prisma.lesson.count(),
        ]);

      const totalPotential = totalLessons * totalGrantedEnrollments;

      const averageProgress =
        totalPotential > 0
          ? Math.round((totalCompleted / totalPotential) * 100)
          : 0;

      const result = {
        value: averageProgress,
        lastUpdated: new Date().toISOString(),
      };

      console.log(
        `[AverageProgress OPTIMIZED] Computed + Cached in ${
          Date.now() - startTime
        }ms`,
      );

      return result;
    },
    2592000, // 30 days
  );
}

import { getUserDashboardData } from "@/app/dashboard/actions";

export async function getUserAnalyticsAdmin(
  userId: string,
  clientVersion?: string,
) {
  console.log(
    `[AdminAnalyticsAction] Fetching user analytics for ${userId} (ClientVersion: ${clientVersion || "none"})`,
  );
  await requireAdmin();
  try {
    const [userVersion, globalCoursesVersion] = await Promise.all([
      getGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(userId)),
      getGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION),
    ]);

    const currentVersion = `${userVersion}:${globalCoursesVersion}`;

    // Smart Sync
    if (clientVersion && clientVersion === currentVersion) {
      console.log(
        `[getUserAnalyticsAdmin] Version match for ${userId}. Returning NOT_MODIFIED.`,
      );
      return { status: "not-modified", version: currentVersion };
    }

    const startTime = Date.now();
    // ⚡ [Million-User Scale] Secondary Cache: User Object
    // Even if clientVersion is missing (hard refresh), we hit Redis before DB.
    const user = await withCache(`admin:user_lookup:${userId}`, async () => {
      return await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          image: true,
        },
      });
    }, 3600); // 1 hour cache
    const duration = Date.now() - startTime;
    console.log(
      `[getUserAnalyticsAdmin] User Fetch (Redis-First) took ${duration}ms for User ID: ${userId}`,
    );

    if (!user) {
      return { status: "error", message: "User not found" };
    }

    // Reuse logic from getUserDashboardData and normalize for client
    // Pass userId as the second argument (overriddenUserId)
    const dashboardData = await getUserDashboardData(undefined, userId);

    if (!dashboardData?.data) {
      throw new Error(`Failed to fetch dashboard data for user: ${userId}`);
    }

    return {
      status: "success",
      user,
      ...dashboardData.data,
      totalLessonsCompleted: dashboardData.data.totalCompletedLessons,
      totalTimeSpent: dashboardData.data.totalPlatformActualWatchTime,
      version: currentVersion,
    };
  } catch (error) {
    console.error(`[getUserAnalyticsAdmin] Critical Error:`, error);
    return { status: "error", message: error instanceof Error ? error.message : "Something went wrong" };
  }
}

export async function getUserCourseDetailedProgress(
  userId: string,
  courseId: string,
) {
  console.log(
    `[AdminAnalyticsAction] Fetching detailed course progress (User: ${userId}, Course: ${courseId})`,
  );
  await requireAdmin();
  try {
    const startTime = Date.now();
    const [user, course] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          image: true,
          email: true,
          role: true,
          createdAt: true,
        },
      }),
      prisma.course.findUnique({
        where: { id: courseId },
        include: {
          chapter: {
            orderBy: { position: "asc" },
            include: {
              lesson: {
                orderBy: { position: "asc" },
                include: {
                  lessonProgress: {
                    where: { userId },
                  },
                },
              },
            },
          },
        },
      }),
    ]);
    const duration = Date.now() - startTime;
    console.log(
      `[getUserCourseDetailedProgress] DB Fetch took ${duration}ms for User ID: ${userId}, Course ID: ${courseId}`,
    );

    if (!user || !course) return null;

    return { user, course };
  } catch (error) {
    return null;
  }
}

export async function getAllUsers(
  search?: string,
  page: number = 1,
  limit: number = 100,
  roleFilter?: string,
  clientVersion?: string,
  enrolledOnly?: boolean,
) {
  console.log(
    `[AdminAnalyticsAction] Fetching user list (Search: ${search || "none"}, Page: ${page}, Role: ${roleFilter || "all"}, EnrolledOnly: ${enrolledOnly})`,
  );
  const session = await requireAdmin();

  const rl = await checkRateLimit(`action:getAllUsers:${session.user.id}`, 30, 60);
  if (!rl.success) {
    throw new Error(`Rate limit exceeded. Try again in ${rl.reset} seconds.`);
  }
  try {
    const isDefaultFetch =
      page === 1 &&
      limit === 100 &&
      !search &&
      (roleFilter === "user" || roleFilter === "admin");
    let currentVersion = await getGlobalVersion(
      GLOBAL_CACHE_KEYS.ADMIN_USERS_VERSION,
    );

    if (currentVersion === "0") {
      await incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_USERS_VERSION);
      currentVersion = await getGlobalVersion(
        GLOBAL_CACHE_KEYS.ADMIN_USERS_VERSION,
      );
    }

    let cacheKey =
      roleFilter === "admin"
        ? "admin:admins:list" // New key for admins
        : GLOBAL_CACHE_KEYS.ADMIN_USERS_LIST;

    if (enrolledOnly) {
      cacheKey = `${cacheKey}:enrolled`;
    }

    // 1. Version Match check
    if (isDefaultFetch && clientVersion && clientVersion === currentVersion) {
      console.log(
        `[getAllUsers] Version Match (${clientVersion}) for ${roleFilter}. Returning NOT_MODIFIED.`,
      );
      return { status: "not-modified", version: currentVersion };
    }

    // 2. Global List Cache
    if (isDefaultFetch) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        console.log(
          `[getAllUsers] Redis ${roleFilter} List Cache HIT. Returning data.`,
        );
        return { ...cached, version: currentVersion };
      }
      console.log(
        `[getAllUsers] Redis ${roleFilter} List Cache MISS. Fetching from DB...`,
      );
    }

    const skip = (page - 1) * limit;

    const whereClause: any = {
      AND: [],
    };

    if (search) {
      whereClause.AND.push({
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { id: { contains: search, mode: "insensitive" } },
          { phoneNumber: { contains: search, mode: "insensitive" } },
        ],
      });
    }
    // Strict role filtering with case insensitivity
    if (roleFilter === "admin") {
      whereClause.AND.push({
        role: { equals: "admin", mode: "insensitive" },
      });
    } else if (roleFilter === "user") {
      whereClause.AND.push({
        OR: [
          { role: null },
          { NOT: { role: { equals: "admin", mode: "insensitive" } } },
        ],
      });
    }

    if (enrolledOnly) {
      whereClause.AND.push({
        enrollment: {
          some: {
            status: "Granted",
          },
        },
      });
    }

    const startTime = Date.now();
    const users = await prisma.user.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        image: true,
        phoneNumber: true,
        _count: {
          select: { enrollment: true },
        },
      },
      take: limit,
      skip: skip,
    });

    const totalUsers = await prisma.user.count({
      where: whereClause,
    });
    const duration = Date.now() - startTime;
    console.log(
      `[getAllUsers] DB Fetch (List + Count) took ${duration}ms. Filters: ${JSON.stringify(whereClause)}`,
    );

    const hasNextPage = skip + users.length < totalUsers;

    const result = {
      users,
      hasNextPage,
      totalUsers,
      version: currentVersion,
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
      totalUsers: 0,
    };
  }
}

export async function updateUserRole(userId: string, newRole: string) {
  console.log(
    `[AdminAnalyticsAction] Updating user role for ${userId} to ${newRole}`,
  );
  await requireAdmin();
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { role: newRole },
    });

    // Invalidate cache
    console.log(
      `[updateUserRole] Invalidating extensive user/admin caches for User=${userId}`,
    );
    const cacheStartTime = Date.now();
    await Promise.all([
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_USERS_LIST),
      invalidateCache(`${GLOBAL_CACHE_KEYS.ADMIN_USERS_LIST}:enrolled`),
      invalidateCache("admin:admins:list"), // Also invalidate admins list
      invalidateCache("admin:admins:list:enrolled"),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_USERS_VERSION),
      // Invalidate specifically for this user
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(userId)),
      invalidateCache(`user:dashboard:${userId}`),
      // 🛡️ [Million-User Scale] Debounced: Prevent thundering herd on admin analytic views
      incrementGlobalVersionDebounced(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION, 60),
      incrementGlobalVersionDebounced(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_VERSION, 60),
    ]);
    console.log(
      `[updateUserRole] Cache invalidation took ${Date.now() - cacheStartTime}ms`,
    );

    revalidatePath("/admin/analytics/users");
    revalidatePath(`/admin/analytics/users/${userId}`);
    revalidatePath("/admin/analytics");
    return { success: true };
  } catch (error) {
    return { success: false, error: "Failed to update role" };
  }
}
