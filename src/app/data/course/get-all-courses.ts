import "server-only";
import { prisma } from "@/lib/db";
import { cache } from "react";
import {
  getCache,
  setCache,
  GLOBAL_CACHE_KEYS,
  getGlobalVersion,
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
  // ✅ Optimization: Parallel version fetches
  const [coursesVersion, userVersion] = await Promise.all([
    getGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION),
    userId
      ? getGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(userId))
      : Promise.resolve(""),
  ]);

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
  const cached = await getCache<RedisCoursesCache>(cacheKey);
  console.log(
    `[getAllCourses] Redis course list lookup took ${Date.now() - redisStartTime}ms. Result: ${cached ? "HIT" : "MISS"}`,
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
      duration: c.duration,
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
    console.log(`[getAllCourses] REDIS MISS -> DB Computation`);
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
    allCourses = dbRaw.map((c) => ({
      id: c.id,
      title: c.title,
      smallDescription: c.smallDescription,
      duration: c.duration,
      level: c.level,
      fileKey: c.fileKey,
      category: c.category,
      slug: c.slug,
      firstLessonId: c.chapter?.[0]?.lesson?.[0]?.id ?? null,
    }));
    await setCache(
      cacheKey,
      { data: allCourses, version: currentVersion },
      2592000,
    );
    console.log(
      `[getAllCourses] DB Computation took ${Date.now() - startTime}ms`,
    );
  }

  let resultCourses = allCourses;

  if (userId) {
    const mergeStart = Date.now();
    const enrollCacheKey = `user:enrollment-map:${userId}:${userVersion}`;
    const redisEnrollStartTime = Date.now();
    let mapValues = await getCache<[string, string][]>(enrollCacheKey);
    console.log(
      `[getAllCourses] Redis enrollment map lookup took ${Date.now() - redisEnrollStartTime}ms. Result: ${mapValues ? "HIT" : "MISS"}`,
    );

    if (!mapValues) {
      console.log(
        `[getAllCourses] Enrollment Map MISS for ${userId} -> DB Query`,
      );
      const enrollments = await prisma.enrollment.findMany({
        where: { userId },
        select: { courseId: true, status: true },
      });
      mapValues = enrollments.map(
        (e) => [e.courseId, e.status] as [string, string],
      );
      await setCache(enrollCacheKey, mapValues, 86400 * 7);
    } else {
      console.log(`[getAllCourses] Enrollment Map HIT for ${userId}`);
    }

    const map = new Map(mapValues);

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
