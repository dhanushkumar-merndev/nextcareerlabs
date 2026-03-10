import "server-only";
import { prisma } from "@/lib/db";
import { requireAdmin } from "./require-admin";
import { EnrollmentStatus } from "@/generated/prisma";
import {
  getCache,
  setCache,
  getGlobalVersion,
  incrementGlobalVersion,
  GLOBAL_CACHE_KEYS,
} from "@/lib/redis";

export async function adminGetEnrollmentRequests(
  skip: number = 0,
  take: number = 10,
  status?: EnrollmentStatus | "All",
  search?: string,
  clientVersion?: string,
) {
  await requireAdmin();

  const baseWhere: any = {};

  if (search) {
    baseWhere.User = {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { id: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phoneNumber: { contains: search, mode: "insensitive" } },
      ],
    };
  }

  if (status && status !== "All") {
    baseWhere.status = status;
  }

  // --- SMART SYNC LOGIC ---
  const isDefaultFetch =
    skip === 0 && take === 10 && (!status || status === "All") && !search;
  const currentVersion = await getGlobalVersion(
    GLOBAL_CACHE_KEYS.ADMIN_ENROLLMENTS_VERSION,
  );

  // 1. Version Match check (only if caller provides a version)
  // Non-search, default list only. Search is handled separately.
  if (isDefaultFetch && clientVersion && clientVersion === currentVersion) {
    console.log(
      `%c[adminGetEnrollmentRequests] SERVER HIT: NOT_MODIFIED (${clientVersion}).`,
      "color: #eab308; font-weight: bold",
    );
    return { status: "not-modified", version: currentVersion };
  }

  // 2. Global List Cache (for default first page)
  const redisStartTime = Date.now();
  const cachedRaw = await getCache<any>(
    GLOBAL_CACHE_KEYS.ADMIN_ENROLLMENTS_LIST,
  );
  const redisDuration = Date.now() - redisStartTime;
  const cached = cachedRaw && Array.isArray(cachedRaw.data) ? cachedRaw : null;
  if (cached) {
    console.log(
      `%c[adminGetEnrollmentRequests] REDIS HIT (${redisDuration}ms). Version: ${currentVersion}`,
      "color: #eab308; font-weight: bold",
    );
    return { ...cached, version: currentVersion };
  }

  // Redis Search Cache (5 min TTL)
  const searchCacheKey = search
    ? `admin:enrollments:search:${search.toLowerCase()}:${status || "All"}:${skip}:${take}`
    : null;

  if (searchCacheKey) {
    const redisStartTime = Date.now();
    const cachedRaw = await getCache<{ data: any[]; totalCount: number }>(
      searchCacheKey,
    );
    const redisDuration = Date.now() - redisStartTime;
    const cached =
      cachedRaw && Array.isArray(cachedRaw.data) ? cachedRaw : null;
    if (cached) {
      console.log(
        `%c[adminGetEnrollmentRequests] REDIS SEARCH HIT (${redisDuration}ms) for "${search}".`,
        "color: #eab308; font-weight: bold",
      );
      return cached;
    }
  }

  // 1. Get total count for the filtered set
  const startTime = Date.now();
  const totalCount = await prisma.enrollment.count({
    where: baseWhere,
  });

  let enrollments: any[] = [];

  // Logic: Always show ALL pending if we are on the first page and no specific status filter is active
  // OR if we are specifically filtering for Pending.
  if (skip === 0 && (!status || status === "All" || status === "Pending")) {
    const pendingWhere = {
      ...baseWhere,
      status: "Pending" as EnrollmentStatus,
    };
    const pending = await prisma.enrollment.findMany({
      where: pendingWhere,
      include: {
        Course: { select: { title: true, id: true } },
        User: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
            image: true,
            createdAt: true,
            banned: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: take,
    });

    enrollments = [...pending];

    // If we have fewer than 'take' items, backfill with others
    if (enrollments.length < take && (!status || status === "All")) {
      const others = await prisma.enrollment.findMany({
        where: { ...baseWhere, status: { not: "Pending" } },
        include: {
          Course: { select: { title: true, id: true } },
          User: {
            select: {
              id: true,
              name: true,
              email: true,
              phoneNumber: true,
              image: true,
              createdAt: true,
              banned: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: take - enrollments.length,
      });
      enrollments = [...enrollments, ...others];
    }
  } else {
    // Normal pagination for subsequent pages or specific filters
    enrollments = await prisma.enrollment.findMany({
      where: baseWhere,
      include: {
        Course: { select: { title: true, id: true } },
        User: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
            image: true,
            createdAt: true,
            banned: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    });
  }
  const duration = Date.now() - startTime;
  console.log(
    `%c[adminGetEnrollmentRequests] DB HIT (${duration}ms). Total: ${totalCount}, Rows: ${enrollments.length}${search ? `, Search: "${search}"` : ""}.`,
    "color: #eab308; font-weight: bold",
  );

  const result: any = {
    data: enrollments,
    totalCount,
    version: currentVersion,
  };

  if (searchCacheKey) {
    await setCache(searchCacheKey, result, 300); // 5 min
  }

  // Cache default list for 30 days (effective forever)
  if (isDefaultFetch) {
    await setCache(
      GLOBAL_CACHE_KEYS.ADMIN_ENROLLMENTS_LIST,
      { data: enrollments, totalCount },
      2592000,
    );
  }

  return result;
}
