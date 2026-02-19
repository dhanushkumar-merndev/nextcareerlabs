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

  // Fetch all enrollments within last 30 days
  const enrollments = await prisma.enrollment.findMany({
    where: {
      createdAt: {
        gte: startDate,
      },
    },
    select: {
      createdAt: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  // Build fixed 30-day data structure
  const last30Days: { date: string; enrollments: number }[] = [];
  const counts: Record<string, number> = {};

  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);

    // timezone-safe yyyy-mm-dd
    const key = d.toLocaleDateString("en-CA");

    last30Days.push({ date: key, enrollments: 0 });
    counts[key] = 0;
  }

  // Count enrollments per day
  for (const en of enrollments) {
    const key = en.createdAt.toLocaleDateString("en-CA");
    if (counts[key] !== undefined) {
      counts[key]++;
    }
  }

  // Merge final values
  const finalData = last30Days.map((item) => ({
    date: item.date,
    enrollments: counts[item.date] ?? 0,
  }));

  // Cache for 6 hours
  await setCache(cacheKey, finalData, 21600);

  return {
    data: finalData,
    version: currentVersion,
  };
}
