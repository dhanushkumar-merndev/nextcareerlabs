// ════════════════════════════════════════════════════════════════
// get-all-courses.ts — Fetch paginated course listings
// Tiers: Version match (🔵) → Redis (🟢) → DB (🔴) → Response
// ════════════════════════════════════════════════════════════════

import "server-only";
import { prisma } from "@/lib/db";
import { cache } from "react";
import {
  setCache,
  getCache,
  getVersions,
  GLOBAL_CACHE_KEYS,
  getOrSetWithStampedePrevention,
} from "@/lib/redis";
import { CoursesServerResult, PublicCourseType } from "@/lib/types/course";

const PAGE_SIZE = 9;

// getAllCoursesInternal — Fetch paginated course listings with search, pagination & enrollment
// Caching tiers: Version match (🔵) → Redis (🟢) → DB (🔴) → Response
const getAllCoursesInternal = async (
  clientVersion?: string,
  userId?: string,
  cursor?: string | null,
  searchQuery?: string,
  onlyAvailable?: boolean,
): Promise<CoursesServerResult> => {
  const t0 = Date.now();
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
    if (process.env.NODE_ENV === "development") {
      console.log(
        `[getAllCourses] Version Match (${clientVersion}). Returning NOT_MODIFIED.`,
      );
    }
    return { status: "not-modified", version: currentVersion };
  }

  // ✅ Optimization: Include version in key to avoid stale global data
  const cacheKey = `${GLOBAL_CACHE_KEYS.COURSES_LIST}:${coursesVersion}`;
  const enrollCacheKey = userId ? `user:enrollment-map:${userId}:${userVersion}` : null;

  let allCourses: PublicCourseType[];

  if (searchQuery) {
    if (process.env.NODE_ENV === "development") {
      console.log(`[getAllCourses] SEARCH: "${searchQuery}" -> DB Query`);
    }
    const dbStart = Date.now();
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
        isFree: true,
        freeChaptersCount: true,
        price: true,
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
      isFree: c.isFree ?? true,
      freeChaptersCount: c.freeChaptersCount ?? 0,
      price: c.price ? Number(c.price) : null,
      firstLessonId: c.chapter?.[0]?.lesson?.[0]?.id ?? null,
    }));
    if (process.env.NODE_ENV === "development") {
      console.log(`[getAllCourses] DB Search took ${Date.now() - dbStart}ms`);
    }
  } else {
    // getOrSetWithStampedePrevention handles HIT/MISS/stampede in one call
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
            isFree: true,
            freeChaptersCount: true,
            price: true,
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
          isFree: c.isFree ?? true,
          freeChaptersCount: c.freeChaptersCount ?? 0,
          price: c.price ? Number(c.price) : null,
          firstLessonId: c.chapter?.[0]?.lesson?.[0]?.id ?? null,
        }));
        if (process.env.NODE_ENV === "development") {
          console.log(`[getAllCourses] DB Computation took ${Date.now() - dbStartTime}ms`);
        }
        return normalized;
      },
      2592000, // 30 days
    );
  }

  let resultCourses = allCourses;

  if (userId) {
    const mergeStart = Date.now();

    let mapValues = await getCache<[string, string | null][]>(enrollCacheKey!);

    if (!mapValues) {
      if (process.env.NODE_ENV === "development") {
        console.log(
          `[getAllCourses] Enrollment Map MISS for ${userId} -> DB Query`,
        );
      }
      const enrollments = await prisma.enrollment.findMany({
        where: { userId },
        select: { courseId: true, status: true },
      });
      mapValues = enrollments.map(
        (e) => [e.courseId, e.status] as [string, string | null],
      );
      await setCache(enrollCacheKey!, mapValues, 86400 * 7);
    } else {
      if (process.env.NODE_ENV === "development") {
        console.log(`[getAllCourses] Enrollment Map HIT for ${userId}`);
      }
    }

    const map = new Map<string, string | null>(mapValues ?? []);

    if (onlyAvailable) {
      resultCourses = allCourses
        .filter((c) => map.get(c.id) !== "Granted")
        .map((c) => ({ ...c, enrollmentStatus: map.get(c.id) ?? null }));
      if (process.env.NODE_ENV === "development") {
        console.log(
          `[getAllCourses] Filtered Enrollment Merge took ${Date.now() - mergeStart}ms`,
        );
      }
    } else {
      // ✅ FIX: cursor not found → startIndex = allCourses.length → returns empty page (no silent restart)
      const idx = cursor ? allCourses.findIndex((c) => c.id === cursor) : -1;
      const startIndex = cursor && idx === -1 ? allCourses.length : idx + 1;

      const page = allCourses.slice(startIndex, startIndex + PAGE_SIZE);
      resultCourses = page.map((c) => ({
        ...c,
        enrollmentStatus: map.get(c.id) ?? null,
      }));

      if (process.env.NODE_ENV === "development") {
        console.log(
          `[getAllCourses] Optimized Merge (Sliced first) took ${Date.now() - mergeStart}ms`,
        );
      }

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
