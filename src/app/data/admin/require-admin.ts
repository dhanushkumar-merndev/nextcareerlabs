import "server-only";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthSession } from "@/lib/types/auth";
import { cache } from "react";
import { getCache, setCache } from "@/lib/redis";
import { createHash } from "crypto";

function extractSessionToken(cookieHeader: string): string | null {
  const match = cookieHeader.match(
    /(?:better-auth\.session_token|next-auth\.session-token)=([^;]+)/,
  );
  return match ? match[1] : null;
}

export const requireAdmin = cache(async () => {
  const startTime = Date.now();
  const h = await headers();

  const cookieHeader = h.get("cookie");
  const sessionToken = cookieHeader ? extractSessionToken(cookieHeader) : null;
  const cacheKey = sessionToken
    ? `fast_session:${createHash("sha256").update(sessionToken).digest("hex").slice(0, 32)}`
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

  if (cacheKey) {
    await setCache(cacheKey, session, 120);
  }

  return session;
});
