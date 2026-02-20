import "server-only";
import { prisma } from "@/lib/db";
import { requireAdmin } from "./require-admin";
import { getCache, setCache, GLOBAL_CACHE_KEYS, getGlobalVersion, incrementGlobalVersion } from "@/lib/redis";

export async function adminGetEnrollmentsStats(clientVersion?: string) {
  await requireAdmin();
  let currentVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ENROLLMENTS_VERSION);

  if (currentVersion === "0") {
    console.log(`[adminGetEnrollmentsStats] Version key missing. Initializing...`);
    await incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ENROLLMENTS_VERSION);
    currentVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ENROLLMENTS_VERSION);
  }

  if (clientVersion && clientVersion === currentVersion) {
    console.log(`[adminGetEnrollmentsStats] Version Match (${clientVersion}) for key "${GLOBAL_CACHE_KEYS.ADMIN_ENROLLMENTS_VERSION}". Returning NOT_MODIFIED.`);
    return { status: "not-modified", version: currentVersion };
  }

  if (!clientVersion) {
    console.log(`[adminGetEnrollmentsStats] SSR Request (Client: None). Returning full data for Prop.`);
  } else {
    console.log(`[adminGetEnrollmentsStats] Background Sync (Client: ${clientVersion}, Server: ${currentVersion}) for key "${GLOBAL_CACHE_KEYS.ADMIN_ENROLLMENTS_VERSION}". Checking Redis...`);
  }

  const cacheKey = `${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:enrollments`;
  const cached = await getCache<any>(cacheKey);

  if (cached) {
     console.log(`[adminGetEnrollmentsStats] Redis Cache HIT. Returning data.`);
     return { data: cached, version: currentVersion };
  }

  console.log(`[adminGetEnrollmentsStats] Redis Cache MISS. Fetching from Prisma DB...`);

  const today = new Date();
  const startDate = new Date();
  startDate.setDate(today.getDate() - 29); // include today

  const startTime = Date.now();
  // Fetch counts grouped by date (YYYY-MM-DD format in DB or transform here)
  // For PostgreSQL, we can use a raw query or groupBy if we have a date-only field.
  // Since createdAt is DateTime, we'll use findMany with select but only get count if possible, 
  // or a more optimized approach.
  
  // High performance: Aggregate in DB
  const rawEnrollments = await prisma.$queryRaw`
    SELECT DATE_TRUNC('day', "createdAt") as date, count(*)::int as count
    FROM "Enrollment"
    WHERE "createdAt" >= ${startDate}
    GROUP BY DATE_TRUNC('day', "createdAt")
    ORDER BY date ASC
  `;
  const duration = Date.now() - startTime;
  console.log(`[adminGetEnrollmentsStats] DB Aggregation took ${duration}ms.`);

  const statsMap = new Map((rawEnrollments as any[]).map(e => [
      new Date(e.date).toLocaleDateString("en-CA"), 
      e.count
  ]));

  // Build fixed 30-day data structure
  const finalData = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toLocaleDateString("en-CA");
    finalData.push({ 
        date: key, 
        enrollments: statsMap.get(key) || 0 
    });
  }

  // Cache for 30 days (effective forever)
  await setCache(cacheKey, finalData, 2592000);

  return {
    data: finalData,
    version: currentVersion,
  };
}
