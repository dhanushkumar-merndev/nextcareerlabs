import "server-only";
import { prisma } from "@/lib/db";
import { requireAdmin } from "./require-admin";
import { getCache, setCache, GLOBAL_CACHE_KEYS, getGlobalVersion, incrementGlobalVersion } from "@/lib/redis";

export interface AdminDashboardVersions {
  stats?: string;
  enrollments?: string;
  recentCourses?: string;
}

export async function adminGetDashboardData(clientVersions?: AdminDashboardVersions) {
  // 1. Security Check
  await requireAdmin();

  // 2. Fetch all current server versions in parallel
  const [serverStatsV, serverEnrollV, serverRecentV] = await Promise.all([
    getGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS_VERSION),
    getGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ENROLLMENTS_VERSION),
    getGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_RECENT_COURSES_VERSION),
  ]);

  // Ensure initializing if missing
  const vCheck = async (v: string, key: string) => {
    if (v === "0") {
      await incrementGlobalVersion(key);
      return await getGlobalVersion(key);
    }
    return v;
  };

  const finalV = {
    stats: await vCheck(serverStatsV, GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS_VERSION),
    enrollments: await vCheck(serverEnrollV, GLOBAL_CACHE_KEYS.ADMIN_ENROLLMENTS_VERSION),
    recentCourses: await vCheck(serverRecentV, GLOBAL_CACHE_KEYS.ADMIN_RECENT_COURSES_VERSION),
  };

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
    const cacheKey = GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS;
    const cached = await getCache<any>(cacheKey);

    if (cached) {
      console.log(`[Dashboard] Stats: Redis HIT (v${finalV.stats})`);
      return cached;
    }

    const dbStart = Date.now();
    const [totalUsers, enrolledUsers, totalCourses, totalLessons] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { enrollment: { some: {} } } }),
      prisma.course.count(),
      prisma.lesson.count(),
    ]);
    const data = { totalUsers, enrolledUsers, totalCourses, totalLessons };
    console.log(`[Dashboard] Stats: DB Fetch took ${Date.now() - dbStart}ms (v${finalV.stats})`);
    
    await setCache(cacheKey, data, 2592000);
    return data;
  };

  // B. Enrollments
  const fetchEnrollments = async () => {
    const cacheKey = `${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:enrollments`;
    const cached = await getCache<any>(cacheKey);

    if (cached) {
      console.log(`[Dashboard] Enrollments: Redis HIT (v${finalV.enrollments})`);
      return cached;
    }

    const dbStart = Date.now();
    const today = new Date();
    const startDate = new Date();
    startDate.setDate(today.getDate() - 29);
    const raw: any[] = await prisma.$queryRaw`
      SELECT DATE_TRUNC('day', "createdAt") as date, count(*)::int as count
      FROM "Enrollment"
      WHERE "createdAt" >= ${startDate}
      GROUP BY DATE_TRUNC('day', "createdAt")
      ORDER BY date ASC
    `;
    const statsMap = new Map(raw.map(e => [new Date(e.date).toLocaleDateString("en-CA"), e.count]));
    const data = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toLocaleDateString("en-CA");
      data.push({ date: key, enrollments: statsMap.get(key) || 0 });
    }
    console.log(`[Dashboard] Enrollments: DB Aggregation took ${Date.now() - dbStart}ms (v${finalV.enrollments})`);

    await setCache(cacheKey, data, 2592000);
    return data;
  };

  // C. Recent Courses
  const fetchRecent = async () => {
    const cacheKey = `${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:recent_courses`;
    const cached = await getCache<any>(cacheKey);

    if (cached) {
      console.log(`[Dashboard] RecentCourses: Redis HIT (v${finalV.recentCourses})`);
      return cached;
    }

    const dbStart = Date.now();
    const data = await prisma.course.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, title: true, smallDescription: true, duration: true, level: true, status: true, fileKey: true, slug: true, category: true },
    });
    console.log(`[Dashboard] RecentCourses: DB Fetch took ${Date.now() - dbStart}ms (v${finalV.recentCourses})`);

    await setCache(cacheKey, data, 2592000);
    return data;
  };

  const [stats, enrollments, recent] = await Promise.all([fetchStats(), fetchEnrollments(), fetchRecent()]);

  const duration = Date.now() - startTime;
  console.log(`[adminGetDashboardData] Consolidated Action Complete: ${duration}ms.`);

  return {
    data: {
      stats,
      enrollments,
      recentCourses: recent
    },
    versions: finalV
  };
}
