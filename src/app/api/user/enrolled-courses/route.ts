import { getCurrentUser } from "@/lib/session";
import { NextResponse } from "next/server";
import { getEnrolledCourses } from "@/app/data/user/get-enrolled-courses";
import { getCache, setCache, getGlobalVersion, GLOBAL_CACHE_KEYS } from "@/lib/redis";

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });

    const { searchParams } = new URL(req.url);
    const clientVersion = searchParams.get("version");

    // Build current version
    const [userVersion, globalVersion] = await Promise.all([
      getGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(user.id)),
      getGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION)
    ]);
    const currentVersion = `${userVersion}:${globalVersion}`;

    // Version match -> NOT_MODIFIED
    if (clientVersion && clientVersion === currentVersion) {
      return NextResponse.json({ status: "not-modified", version: currentVersion });
    }

    // Redis check
    const redisCacheKey = GLOBAL_CACHE_KEYS.USER_ENROLLMENTS(user.id, currentVersion);
    const cached = await getCache<any>(redisCacheKey);
    if (cached) {
      return NextResponse.json({ enrollments: cached, version: currentVersion });
    }

    // DB fetch
    const data = await getEnrolledCourses();
    const isEnrolled = data.enrollments.length > 0;

    // Cache in Redis 30 days
    await setCache(redisCacheKey, data.enrollments, 2592000);

    const response = NextResponse.json(
      { enrollments: data.enrollments, version: currentVersion },
    );

    response.cookies.set("is_enrolled", isEnrolled.toString(), {
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
      sameSite: "lax",
    });

    return response;
  } catch (error) {
    console.error("[Enrolled Courses API Error]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}