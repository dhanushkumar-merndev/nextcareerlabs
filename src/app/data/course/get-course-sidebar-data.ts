"use server";
import { requireUser } from "../user/require-user";
import { prisma } from "@/lib/db";

import {
  getCache,
  setCache,
  GLOBAL_CACHE_KEYS,
  getVersions,
  getUserPendingProgress,
  withDistributedLock,
} from "@/lib/redis";
export async function getCourseSidebarData(
  slug: string,
  clientVersion?: string,
) {
  const session = await requireUser();
  const [slugV, userVersion] = await getVersions([
    GLOBAL_CACHE_KEYS.SLUG_VERSION(slug),
    GLOBAL_CACHE_KEYS.USER_VERSION(session.id),
  ]);
  const currentVersion = `${slugV}_${userVersion}`;

  // Smart Sync – version match means client local cache is fresh
  if (clientVersion && clientVersion === currentVersion) {
    if (process.env.NODE_ENV === "development") {
      console.log(
        `%c[Sidebar] ✅ VERSION MATCH → NOT_MODIFIED (v${currentVersion})`,
        "color: #22c55e; font-weight: bold",
      );
    }
    return { status: "not-modified", version: currentVersion };
  }

  // ── Tier 2: Redis ─────────────────────────────────────────────────
  const cacheKey = `user:sidebar:${session.id}:${slug}:${currentVersion}`;
  const cached = await getCache<unknown>(cacheKey);
  if (cached) {
    if (process.env.NODE_ENV === "development") {
      console.log(
        `%c[Sidebar] 🔵 REDIS HIT → sidebar:${slug} (v${currentVersion})`,
        "color: #3b82f6; font-weight: bold",
      );
    }
    return { ...cached, version: currentVersion };
  }

  // ── Tier 3: Database (distributed lock prevents stampedes) ─────
  if (process.env.NODE_ENV === "development") {
    console.log(
      `%c[Sidebar] 🗄️  DB COMPUTE → sidebar:${slug}`,
      "color: #f97316; font-weight: bold",
    );
  }
  const dbStart = Date.now();

  const result = await withDistributedLock(`fetch:${cacheKey}`, async () => {
    // Double-check cache inside lock (another request may have filled it)
    const recheck = await getCache<unknown>(cacheKey);
    if (recheck) return recheck;

    const courseBase = await prisma.course.findUnique({
      where: { slug },
      select: {
        id: true, title: true, fileKey: true, duration: true,
        level: true, category: true, slug: true, isFree: true,
        freeChaptersCount: true,
        smallDescription: true,
      },
    });

    if (!courseBase) {
      const err: { status: "not-found"; course: null } = { status: "not-found", course: null };
      await setCache(cacheKey, err, 2592000);
      return err;
    }

    const enrollmentRows = await prisma.$queryRaw<
      { status: string | null; demoStarted: boolean }[]
    >`
      SELECT "status"::text AS "status", "demoStarted"
      FROM "Enrollment"
      WHERE "userId" = ${session.id} AND "courseId" = ${courseBase.id}
      LIMIT 1
    `;
    const enrollment = enrollmentRows[0] ?? null;

    const hasFullAccess = enrollment?.status === "Granted";
    const hasDemoAccess = Boolean(enrollment?.demoStarted);
    const hasCourseDemo = courseBase.isFree && courseBase.freeChaptersCount > 0;

    if (!hasFullAccess && !hasDemoAccess && !hasCourseDemo) {
      const err: { status: "not-enrolled"; course: null } = { status: "not-enrolled", course: null };
      await setCache(cacheKey, err, 2592000);
      return err;
    }

    const demoBoundary = hasFullAccess ? 999999 : courseBase.freeChaptersCount;

    const [demoChapters, lockedChapters] = await Promise.all([
      prisma.chapter.findMany({
        where: { courseId: courseBase.id, position: { lte: demoBoundary } },
        orderBy: { position: "asc" },
        select: {
          title: true, id: true, position: true,
          lesson: {
            orderBy: { position: "asc" },
            select: {
              id: true, title: true, position: true,
              description: true, thumbnailKey: true, duration: true,
              lessonProgress: {
                where: { userId: session.id },
                select: {
                  completed: true, quizPassed: true, lessonId: true,
                  id: true, restrictionTime: true, lastWatched: true,
                },
              },
            },
          },
        },
      }),
      prisma.chapter.findMany({
        where: { courseId: courseBase.id, position: { gt: demoBoundary } },
        orderBy: { position: "asc" },
        select: {
          title: true, id: true, position: true,
          lesson: {
            orderBy: { position: "asc" },
            select: { id: true, title: true, position: true },
          },
        },
      }),
    ]);

    const course = {
      ...courseBase,
      chapter: [
        ...demoChapters.map((ch) => ({
          ...ch,
          lesson: ch.lesson.map((lesson) => ({
            ...lesson,
            isLocked: false,
            duration: lesson.duration || 0,
          })),
        })),
        ...lockedChapters.map((ch) => ({
          ...ch,
          lesson: ch.lesson.map((lesson) => ({
            ...lesson,
            description: null,
            thumbnailKey: null,
            duration: 0,
            isLocked: true,
            lessonProgress: [],
          })),
        })),
      ],
    };

    if (process.env.NODE_ENV === "development") {
      console.log(`%c[Sidebar] 🗄️  DB COMPUTE done in ${Date.now() - dbStart}ms`, "color: #f97316");
    }
    course.duration = course.duration || 0;

    const pending = await getUserPendingProgress(session.id);
    if (Object.keys(pending).length > 0) {
      course.chapter.forEach((ch) => ch.lesson.forEach((lesson) => {
        const safeLesson = lesson as typeof lesson & { isLocked?: boolean };
        if (safeLesson.isLocked) return;
        const p = pending[lesson.id];
        if (p) {
          if (lesson.lessonProgress[0]) {
            lesson.lessonProgress[0].lastWatched = p.lastWatched;
            lesson.lessonProgress[0].restrictionTime = Math.max(lesson.lessonProgress[0].restrictionTime, p.restrictionTime);
          } else {
            lesson.lessonProgress[0] = { id: "", completed: false, quizPassed: false, lessonId: lesson.id, lastWatched: p.lastWatched, restrictionTime: p.restrictionTime } as typeof lesson.lessonProgress[0];
          }
        }
      }));
    }

    const cached = { course };
    await setCache(cacheKey, cached, 2592000);
    return cached;
  });

  if (!result) {
    const recheck = await getCache<unknown>(cacheKey);
    if (recheck) return { ...recheck, version: currentVersion };
    return { status: "not-found" as const, course: null, version: currentVersion };
  }

  return { ...result, version: currentVersion };
}

export type CourseSidebarDataType = Awaited<
  ReturnType<typeof getCourseSidebarData>
>;

export type CourseSidebarCourseData = {
  id: string;
  title: string;
  fileKey: string;
  duration: number;
  level: string;
  category: string;
  slug: string;
  isFree: boolean;
  freeChaptersCount: number;
  smallDescription: string;
  chapter: Array<{
    title: string;
    id: string;
    position: number;
    lesson: Array<{
      id: string;
      title: string;
      position: number;
      description: string | null;
      thumbnailKey: string | null;
      duration: number;
      isLocked: boolean;
      lessonProgress: Array<{
        completed: boolean;
        quizPassed: boolean;
        lessonId: string;
        id: string;
        restrictionTime: number;
        lastWatched: number;
      }>;
    }>;
  }>;
};
