"use server";
import { requireUser } from "../user/require-user";
import { prisma } from "@/lib/db";

import {
  getCache,
  setCache,
  GLOBAL_CACHE_KEYS,
  getGlobalVersion,
  getVersions,
  getUserPendingProgress,
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
              duration: true,
              lessonProgress: {
                where: {
                  userId: session.id,
                },
                select: {
                  completed: true,
                  quizPassed: true,
                  lessonId: true,
                  id: true,
                  restrictionTime: true,
                  lastWatched: true,
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

  // ✅ Normalize durations to seconds (Store is in minutes, UI needs seconds)
  course.duration = (course.duration || 0) * 60;
  course.chapter.forEach((chapter) => {
    chapter.lesson.forEach((lesson) => {
      lesson.duration = (lesson.duration || 0) * 60;
    });
  });

  const result = { course };

  // ── Tier 4: Merge Pending Redis Progress ─────────────────────────
  const pending = await getUserPendingProgress(session.id);
  if (Object.keys(pending).length > 0) {
    console.log(
      `[Sidebar] 🔄 Merging pending Redis progress for ${Object.keys(pending).length} lessons`,
    );
    course.chapter.forEach((chapter) => {
      chapter.lesson.forEach((lesson) => {
        const p = pending[lesson.id];
        if (p) {
          if (lesson.lessonProgress[0]) {
            lesson.lessonProgress[0].lastWatched = p.lastWatched;
            lesson.lessonProgress[0].restrictionTime = Math.max(
              lesson.lessonProgress[0].restrictionTime,
              p.restrictionTime,
            );
          } else {
            // Synthetic progress for UI
            lesson.lessonProgress[0] = {
              completed: false,
              quizPassed: false,
              lessonId: lesson.id,
              lastWatched: p.lastWatched,
              restrictionTime: p.restrictionTime,
            } as any;
          }
        }
      });
    });
  }

  // ── Cache in Redis: 30 days TTL ────────────────────────────────
  await setCache(cacheKey, result, 2592000); // 30 days Redis TTL
  console.log(
    `%c[Sidebar] 💾 CACHED in Redis (30 days) → sidebar:${slug}`,
    "color: #8b5cf6",
  );

  return { ...result, version: currentVersion };
}

export type CourseSidebarDataType = Awaited<
  ReturnType<typeof getCourseSidebarData>
>;
