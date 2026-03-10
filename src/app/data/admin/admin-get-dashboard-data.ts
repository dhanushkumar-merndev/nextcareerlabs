import "server-only";
import { prisma } from "@/lib/db";
import { requireAdmin } from "./require-admin";
import {
  getCache,
  setCache,
  getMultiCache,
  getVersions,
  GLOBAL_CACHE_KEYS,
  getGlobalVersion,
  incrementGlobalVersion,
} from "@/lib/redis";

export interface AdminDashboardVersions {
  stats?: string;
  enrollments?: string;
  recentCourses?: string;
}

export async function adminGetDashboardData(
  clientVersions?: AdminDashboardVersions,
) {
  // 1. Security Check
  await requireAdmin();

  // 2. Fetch all current server versions in parallel (1 round trip)
  const versionKeys = [
    GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS_VERSION,
    GLOBAL_CACHE_KEYS.ADMIN_ENROLLMENTS_VERSION,
    GLOBAL_CACHE_KEYS.ADMIN_RECENT_COURSES_VERSION,
  ];

  const [serverStatsV, serverEnrollV, serverRecentV] =
    await getVersions(versionKeys);

  const finalV = {
    stats: serverStatsV === "0" ? Date.now().toString() : serverStatsV,
    enrollments: serverEnrollV === "0" ? Date.now().toString() : serverEnrollV,
    recentCourses:
      serverRecentV === "0" ? Date.now().toString() : serverRecentV,
  };

  // If any were missing, initialize them (rare after first run)
  if (serverStatsV === "0")
    await setCache(
      GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS_VERSION,
      finalV.stats,
    );
  if (serverEnrollV === "0")
    await setCache(
      GLOBAL_CACHE_KEYS.ADMIN_ENROLLMENTS_VERSION,
      finalV.enrollments,
    );
  if (serverRecentV === "0")
    await setCache(
      GLOBAL_CACHE_KEYS.ADMIN_RECENT_COURSES_VERSION,
      finalV.recentCourses,
    );

  // 2.5 Early Exit if everything matches
  if (
    clientVersions &&
    clientVersions.stats === finalV.stats &&
    clientVersions.enrollments === finalV.enrollments &&
    clientVersions.recentCourses === finalV.recentCourses
  ) {
    console.log(
      `%c[adminGetDashboardData] SERVER HIT: NOT_MODIFIED.`,
      "color: #eab308; font-weight: bold",
    );
    return { status: "not-modified", versions: finalV };
  }

  // 3. Batch Cache Check (1 round trip for all data)
  const dataKeys = [
    GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS,
    `${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:enrollments`,
    `${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:recent_courses`,
  ];

  const redisStartTime = Date.now();
  const [cachedStats, cachedEnrollments, cachedRecent] =
    await getMultiCache<any>(dataKeys);
  const redisDuration = Date.now() - redisStartTime;

  console.log(
    `%c[adminGetDashboardData] REDIS BATCH HIT (${redisDuration}ms). Items: ${[cachedStats, cachedEnrollments, cachedRecent].filter(Boolean).length}/${dataKeys.length}`,
    "color: #eab308; font-weight: bold",
  );

  // 3. Granular Cache Check & DB Fetching logic
  const results: any = {
    stats: null,
    enrollments: null,
    recentCourses: null,
  };

  const startTime = Date.now();

  // Define components for parallel resolution
  const tasks = [];

  // A. Stats
  const fetchStats = async () => {
    if (cachedStats) {
      console.log(`[Dashboard] Stats: Redis HIT (v${finalV.stats})`);
      return cachedStats;
    }

    const dbStart = Date.now();
    const [totalUsers, totalSubscriptions, totalCourses, totalLessons] =
      await Promise.all([
        prisma.user.count(),
        prisma.enrollment.count({ where: { status: "Granted" } }),
        prisma.course.count(),
        prisma.lesson.count(),
      ]);
    const data = { totalUsers, totalSubscriptions, totalCourses, totalLessons };
    console.log(
      `[Dashboard] Stats: DB Fetch took ${Date.now() - dbStart}ms (v${finalV.stats})`,
    );

    await setCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS, data, 2592000);
    return data;
  };

  // B. Enrollments
  const fetchEnrollments = async () => {
    if (cachedEnrollments) {
      console.log(
        `[Dashboard] Enrollments: Redis HIT (v${finalV.enrollments})`,
      );
      return cachedEnrollments;
    }

    const dbStart = Date.now();
    const today = new Date();
    const startDate = new Date();
    startDate.setDate(today.getDate() - 29);
    const raw: any[] = await prisma.$queryRaw`
      SELECT DATE_TRUNC('day', "createdAt") as date, count(*)::int as count
      FROM "Enrollment"
      WHERE "createdAt" >= ${startDate} AND "status" = 'Granted'
      GROUP BY DATE_TRUNC('day', "createdAt")
      ORDER BY date ASC
    `;
    const statsMap = new Map(
      raw.map((e) => [new Date(e.date).toLocaleDateString("en-CA"), e.count]),
    );
    const data = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toLocaleDateString("en-CA");
      data.push({ date: key, enrollments: statsMap.get(key) || 0 });
    }
    console.log(
      `[Dashboard] Enrollments: DB Aggregation took ${Date.now() - dbStart}ms (v${finalV.enrollments})`,
    );

    await setCache(
      `${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:enrollments`,
      data,
      2592000,
    );
    return data;
  };

  // C. Recent Courses
  const fetchRecent = async () => {
    if (cachedRecent) {
      console.log(
        `[Dashboard] RecentCourses: Redis HIT (v${finalV.recentCourses})`,
      );
      return cachedRecent;
    }

    const dbStart = Date.now();
    const data = await prisma.course.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        title: true,
        smallDescription: true,
        duration: true,
        level: true,
        status: true,
        fileKey: true,
        slug: true,
        category: true,
      },
    });
    console.log(
      `[Dashboard] RecentCourses: DB Fetch took ${Date.now() - dbStart}ms (v${finalV.recentCourses})`,
    );

    await setCache(
      `${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:recent_courses`,
      data,
      2592000,
    );
    return data;
  };

  const [stats, enrollments, recent] = await Promise.all([
    fetchStats(),
    fetchEnrollments(),
    fetchRecent(),
  ]);

  const duration = Date.now() - startTime;
  console.log(
    `%c[adminGetDashboardData] SERVER COMPLETED (${duration}ms).`,
    "color: #eab308; font-weight: bold",
  );

  return {
    data: {
      stats,
      enrollments,
      recentCourses: recent,
    },
    versions: finalV,
  };
}
