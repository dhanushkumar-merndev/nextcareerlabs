"use server";
import { requireUser } from "../user/require-user";
import { prisma } from "@/lib/db";

import {
  getCache,
  setCache,
  GLOBAL_CACHE_KEYS,
  getGlobalVersion,
  getVersions,
} from "@/lib/redis";

export async function getCourseSidebarData(
  slug: string,
  clientVersion?: string,
) {
  const session = await requireUser();
  const [coursesVersion, userVersion] = await getVersions([
    GLOBAL_CACHE_KEYS.COURSES_VERSION,
    GLOBAL_CACHE_KEYS.USER_VERSION(session.id),
  ]);
  const currentVersion = `${coursesVersion}_${userVersion}`;

  // Smart Sync – version match means client local cache is fresh
  if (clientVersion && clientVersion === currentVersion) {
    console.log(
      `%c[Sidebar] ✅ VERSION MATCH → NOT_MODIFIED (v${currentVersion})`,
      "color: #22c55e; font-weight: bold",
    );
    return { status: "not-modified", version: currentVersion };
  }

  // ── Tier 2: Redis ─────────────────────────────────────────────────
  const cacheKey = `user:sidebar:${session.id}:${slug}:${currentVersion}`;
  const cached = await getCache<any>(cacheKey);
  if (cached) {
    console.log(
      `%c[Sidebar] 🔵 REDIS HIT → sidebar:${slug} (v${currentVersion})`,
      "color: #3b82f6; font-weight: bold",
    );
    return { ...cached, version: currentVersion };
  }

  // ── Tier 3: Database ──────────────────────────────────────────────
  console.log(
    `%c[Sidebar] 🗄️  DB COMPUTE → sidebar:${slug}`,
    "color: #f97316; font-weight: bold",
  );
  const dbStart = Date.now();

  const course = await prisma.course.findUnique({
    where: {
      slug: slug,
    },
    select: {
      id: true,
      title: true,
      fileKey: true,
      duration: true,
      level: true,
      category: true,
      slug: true,
      chapter: {
        orderBy: {
          position: "asc",
        },
        select: {
          title: true,
          id: true,
          position: true,
          lesson: {
            orderBy: {
              position: "asc",
            },
            select: {
              id: true,
              title: true,
              position: true,
              description: true,
              thumbnailKey: true,
              lessonProgress: {
                where: {
                  userId: session.id,
                },
                select: {
                  completed: true,
                  quizPassed: true,
                  lessonId: true,
                  id: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!course) {
    return {
      status: "not-found" as const,
      course: null,
      version: currentVersion,
    };
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: {
      userId_courseId: {
        userId: session.id,
        courseId: course.id,
      },
    },
  });

  if (!enrollment || enrollment.status !== "Granted") {
    return {
      status: "not-enrolled" as const,
      course: null,
      version: currentVersion,
    };
  }

  console.log(
    `%c[Sidebar] 🗄️  DB COMPUTE done in ${Date.now() - dbStart}ms`,
    "color: #f97316",
  );

  const result = { course };

  // ── Cache in Redis: 30 min hot TTL ────────────────────────────────
  await setCache(cacheKey, result, 1800); // 30 minutes Redis TTL
  console.log(
    `%c[Sidebar] 💾 CACHED in Redis (30 min) → sidebar:${slug}`,
    "color: #8b5cf6",
  );

  return { ...result, version: currentVersion };
}

export type CourseSidebarDataType = Awaited<
  ReturnType<typeof getCourseSidebarData>
>;
