import { getCurrentUser } from "@/lib/session";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  getCache,
  setCache,
  getGlobalVersion,
  GLOBAL_CACHE_KEYS,
} from "@/lib/redis";

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });

    const { searchParams } = new URL(req.url);
    const clientVersion = searchParams.get("version");

    // Build current version
    const [userVersion, globalVersion] = await Promise.all([
      getGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(user.id)),
      getGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION),
    ]);
    const currentVersion = `${userVersion}:${globalVersion}`;

    // Version match -> NOT_MODIFIED
    if (clientVersion && clientVersion === currentVersion) {
      console.log(
        `%c[api/enrolled-courses] SERVER HIT: NOT_MODIFIED (${clientVersion}).`,
        "color: #eab308; font-weight: bold",
      );
      return NextResponse.json({
        status: "not-modified",
        version: currentVersion,
      });
    }

    // Redis check
    const redisCacheKey = GLOBAL_CACHE_KEYS.USER_ENROLLMENTS(
      user.id,
      currentVersion,
    );
    const redisStartTime = Date.now();
    const cached = await getCache<unknown>(redisCacheKey);
    const redisDuration = Date.now() - redisStartTime;

    if (cached) {
      console.log(
        `%c[api/enrolled-courses] REDIS HIT (${redisDuration}ms). Version: ${currentVersion}`,
        "color: #eab308; font-weight: bold",
      );
      return NextResponse.json({
        enrollments: cached,
        version: currentVersion,
      });
    }

    // DB fetch
    const startTime = Date.now();
    const accessRows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "Enrollment"
      WHERE "userId" = ${user.id}
        AND ("status" = 'Granted' OR "demoStarted" = true)
    `;
    const accessIds = accessRows.map((row) => row.id);

    const enrollments = accessIds.length > 0
      ? await prisma.enrollment.findMany({
        where: { id: { in: accessIds } },
        select: {
          Course: {
            select: {
              id: true,
              smallDescription: true,
              title: true,
              fileKey: true,
              level: true,
              slug: true,
              duration: true,
              chapter: {
                orderBy: { position: "asc" },
                select: {
                  id: true,
                  position: true,
                  lesson: {
                    orderBy: { position: "asc" },
                    select: {
                      id: true,
                      position: true,
                      duration: true,
                      lessonProgress: {
                        where: { userId: user.id },
                        select: {
                          completed: true,
                          restrictionTime: true,
                          lastWatched: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      })
      : [];

    const duration = Date.now() - startTime;
    console.log(
      `%c[api/enrolled-courses] DB HIT (${duration}ms).`,
      "color: #eab308; font-weight: bold",
    );

    const isEnrolled = enrollments.length > 0;

    // Cache in Redis 30 days
    await setCache(redisCacheKey, enrollments, 2592000);

    const response = NextResponse.json({
      enrollments,
      version: currentVersion,
    });

    response.cookies.set("is_enrolled", isEnrolled.toString(), {
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
      sameSite: "lax",
    });

    return response;
  } catch {
    console.error("[Enrolled Courses API Error]");
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
