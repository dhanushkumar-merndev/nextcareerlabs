import "server-only";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { headers } from "next/headers";
import { getCache, setCache } from "@/lib/redis";

export async function checkIfCourseBought(courseId: string, userId?: string) {
  const t0 = Date.now();
  let finalUserId = userId;

  if (!finalUserId) {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    finalUserId = session?.user?.id;
  }

  if (!finalUserId) return null;

  const cacheKey = `user:enrolled:${finalUserId}:${courseId}`;
  const cached = await getCache<string>(cacheKey);
  if (cached) {
    if (process.env.NODE_ENV === "development") {
      console.log(`[checkIfCourseBought] Redis HIT (${Date.now() - t0}ms) for course=${courseId}`);
    }
    return cached === "__null__" ? null : cached;
  }

  const rows = await prisma.$queryRaw<
    { status: string | null; demoStarted: boolean; accessRequested: boolean }[]
  >`
    SELECT "status"::text AS "status", "demoStarted", "accessRequested"
    FROM "Enrollment"
    WHERE "courseId" = ${courseId} AND "userId" = ${finalUserId}
    LIMIT 1
  `;

  const enrollment = rows[0];
  const result =
    enrollment?.status === "Granted"
      ? "Granted"
      : enrollment?.accessRequested
        ? "Pending"
        : enrollment?.demoStarted
          ? "Demo"
          : null;
  await setCache(cacheKey, result ?? "__null__", 300); // 5 min TTL

  if (process.env.NODE_ENV === "development") {
    console.log(`[checkIfCourseBought] Took ${Date.now() - t0}ms for course=${courseId}`);
  }

  return result;
}
