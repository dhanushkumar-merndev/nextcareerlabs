import "server-only";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthSession } from "@/lib/types/auth";
import { cache } from "react";
import { getCache, setCache } from "@/lib/redis";

export const requireAdmin = cache(async () => {
  const startTime = Date.now();
  const h = await headers();

  // 🚀 FAST-PATH: Redis Session Cache (Bypass DB/Auth Provider)
  // We only cache the 'success' state for 2 minutes to keep it secure but snappy.
  const sessionCookie = h.get("cookie");
  const cacheKey = sessionCookie
    ? `fast_session:${Buffer.from(sessionCookie).toString("base64").slice(0, 32)}`
    : null;

  if (cacheKey) {
    const cachedSession = await getCache<AuthSession>(cacheKey);
    if (cachedSession) {
      if (process.env.NODE_ENV === "development") {
        console.log(
          `[requireAdmin] ✨ FAST-PATH HIT (${Date.now() - startTime}ms)`,
        );
      }
      return cachedSession;
    }
  }

  const session = (await auth.api.getSession({
    headers: h,
  })) as AuthSession | null;

  if (process.env.NODE_ENV === "development") {
    console.log(
      `[requireAdmin] 🗄️ Session Fetch took ${Date.now() - startTime}ms`,
    );
  }

  if (!session) {
    redirect("/login?auth_failure=true");
  }

  const user = session.user;
  if (user.banned) {
    redirect("/banned");
  }

  if (user.role !== "admin") {
    redirect("/not-admin");
  }

  // Cache successfully verified admin sessions for 120 seconds
  if (cacheKey) {
    await setCache(cacheKey, session, 120);
  }

  return session;
});
