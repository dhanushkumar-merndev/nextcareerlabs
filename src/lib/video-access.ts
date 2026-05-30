import { prisma } from "@/lib/db";
import { hasCourseContentAccess } from "@/lib/course-access";
import { getCurrentUser } from "@/lib/session";
import { getCache, setCache } from "@/lib/redis";
import { NextResponse } from "next/server";

const VIDEO_ACCESS_CACHE_TTL_SECONDS = 10 * 60;

export interface AuthorizedVideoAccess {
  videoKey: string;
  baseKey: string;
  videoEncryptionKey?: string | null;
}

export function getVideoBaseKey(key: string) {
  const path = (() => {
    try {
      return new URL(key).pathname.replace(/^\/+/, "");
    } catch {
      return key.split("?")[0] ?? key;
    }
  })();

  const hlsMatch = path.match(/(?:^|\/)hls\/([^/]+)\//);
  if (hlsMatch?.[1]) return hlsMatch[1];

  return path.split("/").pop()?.replace(/\.[^/.]+$/, "") ?? "";
}

function getVideoAccessCacheKey(
  userId: string,
  lessonId: string,
  baseKey: string,
) {
  return `video:access:${userId}:${lessonId}:${baseKey}`;
}

export async function getAuthorizedVideoAccess(
  lessonId: string,
  requestedBaseKey: string | null,
): Promise<{ access?: AuthorizedVideoAccess; error?: NextResponse }> {
  const user = await getCurrentUser();

  if (!user) {
    return { error: new NextResponse("Unauthorized", { status: 401 }) };
  }

  if (requestedBaseKey) {
    const cached = await getCache<AuthorizedVideoAccess>(
      getVideoAccessCacheKey(user.id, lessonId, requestedBaseKey),
    );

    if (cached?.baseKey === requestedBaseKey) {
      return { access: cached };
    }
  }

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      videoKey: true,
      videoEncryptionKey: true,
      Chapter: {
        select: {
          position: true,
          Course: {
            select: {
              isFree: true,
              freeChaptersCount: true,
              enrollment: {
                where: { userId: user.id },
                select: { status: true },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!lesson?.videoKey) {
    return { error: new NextResponse("Video not found", { status: 404 }) };
  }

  const enrollment = lesson.Chapter.Course.enrollment[0];
  const hasAccess = hasCourseContentAccess({
    isAdmin: user.role === "admin",
    enrollmentStatus: enrollment?.status,
    isFree: lesson.Chapter.Course.isFree,
    freeChaptersCount: lesson.Chapter.Course.freeChaptersCount,
    chapterPosition: lesson.Chapter.position,
  });

  if (!hasAccess) {
    return { error: new NextResponse("Forbidden", { status: 403 }) };
  }

  const baseKey = getVideoBaseKey(lesson.videoKey);
  if (requestedBaseKey && requestedBaseKey !== baseKey) {
    return {
      error: new NextResponse("Stale video version", {
        status: 404,
        headers: { "Cache-Control": "no-store, max-age=0" },
      }),
    };
  }

  const access = {
    videoKey: lesson.videoKey,
    baseKey,
    videoEncryptionKey: lesson.videoEncryptionKey,
  };

  await setCache(
    getVideoAccessCacheKey(user.id, lessonId, baseKey),
    access,
    VIDEO_ACCESS_CACHE_TTL_SECONDS,
  );

  return { access };
}
