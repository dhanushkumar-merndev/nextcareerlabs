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
  onlyAvailable?: boolean
): Promise<CoursesServerResult> => {
  let currentVersion = await getGlobalVersion(
    GLOBAL_CACHE_KEYS.COURSES_VERSION
  );

  // 🔹 If user is logged in, combine global version with user-specific version
  // This ensures enrollment status changes (like deletion or role change) trigger a sync
  let userVersion = "";
  if (userId) {
    userVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(userId));
    currentVersion = `${currentVersion}:${userVersion}`;
  }

  // 🔹 Version short-circuit ONLY for first page
  if (!searchQuery && !cursor && clientVersion && clientVersion === currentVersion) {
    console.log(`[getAllCourses] Version Match (${clientVersion}). Returning NOT_MODIFIED.`);
    return { status: "not-modified", version: currentVersion };
  }

  const cacheKey = GLOBAL_CACHE_KEYS.COURSES_LIST;
  const cached = await getCache<RedisCoursesCache>(cacheKey);

  let allCourses: PublicCourseType[];
  const startTime = Date.now();

  // 🔹 If searching, bypass Redis list and query DB directly for efficiency
  if (searchQuery) {
    console.log(`[getAllCourses] SEARCH: "${searchQuery}" -> DB Query`);
    const searchRaw = await prisma.course.findMany({
      where: {
        status: "Published",
        OR: [
          { title: { contains: searchQuery, mode: 'insensitive' } },
          { smallDescription: { contains: searchQuery, mode: 'insensitive' } }
        ]
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
              select: { id: true }
            }
          }
        }
      },
    });

    // Transform Search DB Results
    allCourses = searchRaw.map(c => ({
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
              select: { id: true }
            }
          }
        }
      },
    });

    // Transform DB Results
    allCourses = dbRaw.map(c => ({
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
      2592000 // 30 days
    );
    console.log(`[getAllCourses] DB Computation took ${Date.now() - startTime}ms`);
  }

  // 🔹 Enrollment merge optimization
  let resultCourses = allCourses;

  if (userId) {
    const mergeStart = Date.now();
    const enrollCacheKey = `user:enrollment-map:${userId}:${userVersion}`;
    
    // Attempt to get enrollment map from Redis
    let mapValues = await getCache<[string, string][]>(enrollCacheKey);
    
    if (!mapValues) {
      console.log(`[getAllCourses] Enrollment Map MISS for ${userId} -> DB Query`);
      const enrollments = await prisma.enrollment.findMany({
        where: { userId },
        select: { courseId: true, status: true },
      });
      mapValues = enrollments.map(e => [e.courseId, e.status] as [string, string]);
      // Cache for 10 minutes (sufficient for a session, and updateable via versioning if needed)
      await setCache(enrollCacheKey, mapValues, 600);
    } else {
      console.log(`[getAllCourses] Enrollment Map HIT for ${userId}`);
    }

    const map = new Map(mapValues);

    if (onlyAvailable) {
      // Must filter BEFORE slicing if we only want available courses
      resultCourses = allCourses.filter((c) => map.get(c.id) !== "Granted");
      
      // Add enrollment status to filtered results
      resultCourses = resultCourses.map((c) => ({
        ...c,
        enrollmentStatus: map.get(c.id) ?? null,
      }));
      
      console.log(`[getAllCourses] Filtered Enrollment Merge took ${Date.now() - mergeStart}ms`);
    } else {
      // OPTIMIZATION: Slice first, then map only for visible items
      const startIndex = cursor
        ? allCourses.findIndex((c) => c.id === cursor) + 1
        : 0;
      
      const page = allCourses.slice(startIndex, startIndex + PAGE_SIZE);
      
      resultCourses = page.map((c) => ({
        ...c,
        enrollmentStatus: map.get(c.id) ?? null,
      }));
      
      console.log(`[getAllCourses] Optimized Merge (Sliced first) took ${Date.now() - mergeStart}ms`);
      
      const nextCursor =
        startIndex + PAGE_SIZE < allCourses.length
          ? resultCourses[resultCourses.length - 1]?.id ?? null
          : null;

      return {
        status: "data",
        version: currentVersion,
        courses: resultCourses,
        nextCursor,
      };
    }
  }

  // 🔹 Default Pagination (for onlyAvailable path or userId absent)
  const startIndex = cursor
    ? resultCourses.findIndex((c) => c.id === cursor) + 1
    : 0;

  const page = resultCourses.slice(startIndex, startIndex + PAGE_SIZE);

  const nextCursor =
    startIndex + PAGE_SIZE < resultCourses.length
      ? page[page.length - 1]?.id ?? null
      : null;

  return {
    status: "data",
    version: currentVersion,
    courses: page,
    nextCursor,
  };
};

export const getAllCourses = cache(getAllCoursesInternal);