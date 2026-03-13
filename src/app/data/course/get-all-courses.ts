import "server-only";
import { prisma } from "@/lib/db";
import { cache } from "react";
import {
  getCache,
  setCache,
  getMultiCache,
  getVersions,
  GLOBAL_CACHE_KEYS,
  getGlobalVersion,
  getOrSetWithStampedePrevention,
} from "@/lib/redis";
import { CoursesServerResult, PublicCourseType } from "@/lib/types/course";

const PAGE_SIZE = 9;

type RedisCoursesCache = {
  data: PublicCourseType[];
  version: string;
};

const getAllCoursesInternal = async (
  clientVersion?: string,
  userId?: string,
  cursor?: string | null,
  searchQuery?: string,
  onlyAvailable?: boolean,
): Promise<CoursesServerResult> => {
  // ✅ Optimization: Batched version fetches in 1 round trip
  const versionKeys = [GLOBAL_CACHE_KEYS.COURSES_VERSION];
  if (userId) versionKeys.push(GLOBAL_CACHE_KEYS.USER_VERSION(userId));

  const [coursesVersion, userVersion = ""] = await getVersions(versionKeys);

  const currentVersion = userId
    ? `${coursesVersion}:${userVersion}`
    : coursesVersion;

  // Version Match Check
  if (
    !searchQuery &&
    !cursor &&
    clientVersion &&
    clientVersion === currentVersion
  ) {
    console.log(
      `[getAllCourses] Version Match (${clientVersion}). Returning NOT_MODIFIED.`,
    );
    return { status: "not-modified", version: currentVersion };
  }

  // ✅ Optimization: Include version in key to avoid stale global data
  const redisStartTime = Date.now();
  const cacheKey = `${GLOBAL_CACHE_KEYS.COURSES_LIST}:${coursesVersion}`;

  // If we have a userId, we might also want to pre-fetch the enrollment map
  // However, the enrollment map key depends on userVersion, so we can batch it here
  const dataKeys = [cacheKey];
  if (userId) {
    dataKeys.push(`user:enrollment-map:${userId}:${userVersion}`);
  }

  const [cached, cachedEnrollMap] = await getMultiCache<any>(dataKeys);

  console.log(
    `[getAllCourses] Redis batch lookup took ${Date.now() - redisStartTime}ms. Courses: ${cached ? "HIT" : "MISS"}, EnrollMap: ${userId ? (cachedEnrollMap ? "HIT" : "MISS") : "N/A"}`,
  );

  let allCourses: PublicCourseType[];
  const startTime = Date.now();

  if (searchQuery) {
    console.log(`[getAllCourses] SEARCH: "${searchQuery}" -> DB Query`);
    const searchRaw = await prisma.course.findMany({
      where: {
        status: "Published",
        OR: [
          { title: { contains: searchQuery, mode: "insensitive" } },
          { smallDescription: { contains: searchQuery, mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        smallDescription: true,
        duration: true,
        level: true,
        fileKey: true,
        category: true,
        slug: true,
        chapter: {
          orderBy: { position: "asc" },
          take: 1,
          select: {
            lesson: {
              orderBy: { position: "asc" },
              take: 1,
              select: { id: true },
            },
          },
        },
      },
    });
    allCourses = searchRaw.map((c) => ({
      id: c.id,
      title: c.title,
      smallDescription: c.smallDescription,
      duration: (c.duration || 0) * 3600, // ✅ Hours -> Seconds
      level: c.level,
      fileKey: c.fileKey,
      category: c.category,
      slug: c.slug,
      firstLessonId: c.chapter?.[0]?.lesson?.[0]?.id ?? null,
    }));
    console.log(`[getAllCourses] DB Search took ${Date.now() - startTime}ms`);
  } else if (cached?.data) {
    console.log(`[getAllCourses] REDIS HIT (v${cached.version})`);
    allCourses = cached.data;
  } else {
    console.log(`[getAllCourses] REDIS MISS -> DB Computation with stampede prevention`);
    allCourses = await getOrSetWithStampedePrevention(
      cacheKey,
      async () => {
        const dbStartTime = Date.now();
        const dbRaw = await prisma.course.findMany({
          where: { status: "Published" },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            title: true,
            smallDescription: true,
            duration: true,
            level: true,
            fileKey: true,
            category: true,
            slug: true,
            chapter: {
              orderBy: { position: "asc" },
              take: 1,
              select: {
                lesson: {
                  orderBy: { position: "asc" },
                  take: 1,
                  select: { id: true },
                },
              },
            },
          },
        });
        const normalized = dbRaw.map((c) => ({
          id: c.id,
          title: c.title,
          smallDescription: c.smallDescription,
          duration: (c.duration || 0) * 3600, // ✅ Hours -> Seconds
          level: c.level,
          fileKey: c.fileKey,
          category: c.category,
          slug: c.slug,
          firstLessonId: c.chapter?.[0]?.lesson?.[0]?.id ?? null,
        }));
        console.log(`[getAllCourses] DB Computation took ${Date.now() - dbStartTime}ms`);
        return normalized;
      },
      2592000, // 30 days
    );
  }

  let resultCourses = allCourses;

  if (userId) {
    const mergeStart = Date.now();
    const enrollCacheKey = `user:enrollment-map:${userId}:${userVersion}`;
    const redisEnrollStartTime = Date.now();

    // ✅ Optimization: Use pre-fetched enrollment map from step 1
    let mapValues: [string, string | null][] = cachedEnrollMap as [
      string,
      string | null,
    ][];

    if (!mapValues) {
      console.log(
        `[getAllCourses] Enrollment Map MISS for ${userId} (or not pre-fetched) -> DB Query`,
      );
      const enrollments = await prisma.enrollment.findMany({
        where: { userId },
        select: { courseId: true, status: true },
      });
      mapValues = enrollments.map(
        (e) => [e.courseId, e.status] as [string, string | null],
      );
      await setCache(enrollCacheKey, mapValues, 86400 * 7);
    } else {
      console.log(`[getAllCourses] Enrollment Map HIT for ${userId}`);
    }

    const map = new Map<string, string | null>(mapValues);

    if (onlyAvailable) {
      resultCourses = allCourses
        .filter((c) => map.get(c.id) !== "Granted")
        .map((c) => ({ ...c, enrollmentStatus: map.get(c.id) ?? null }));
      console.log(
        `[getAllCourses] Filtered Enrollment Merge took ${Date.now() - mergeStart}ms`,
      );
    } else {
      // ✅ FIX: cursor not found → startIndex = allCourses.length → returns empty page (no silent restart)
      const idx = cursor ? allCourses.findIndex((c) => c.id === cursor) : -1;
      const startIndex = cursor && idx === -1 ? allCourses.length : idx + 1;

      const page = allCourses.slice(startIndex, startIndex + PAGE_SIZE);
      resultCourses = page.map((c) => ({
        ...c,
        enrollmentStatus: map.get(c.id) ?? null,
      }));

      console.log(
        `[getAllCourses] Optimized Merge (Sliced first) took ${Date.now() - mergeStart}ms`,
      );

      const nextCursor =
        startIndex + PAGE_SIZE < allCourses.length
          ? (resultCourses[resultCourses.length - 1]?.id ?? null)
          : null;

      return {
        status: "data",
        version: currentVersion,
        courses: resultCourses,
        nextCursor,
      };
    }
  }

  // ✅ FIX: Same cursor guard for default pagination path
  const idx = cursor ? resultCourses.findIndex((c) => c.id === cursor) : -1;
  const startIndex = cursor && idx === -1 ? resultCourses.length : idx + 1;

  const page = resultCourses.slice(startIndex, startIndex + PAGE_SIZE);

  const nextCursor =
    startIndex + PAGE_SIZE < resultCourses.length
      ? (page[page.length - 1]?.id ?? null)
      : null;

  return { status: "data", version: currentVersion, courses: page, nextCursor };
};

export const getAllCourses = cache(getAllCoursesInternal);
