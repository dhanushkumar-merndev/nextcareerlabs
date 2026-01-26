"use client";

import { authClient } from "@/lib/auth-client";
import { chatCache } from "@/lib/chat-cache";
import { useEffect, useState } from "react";

/**
 * A "Smart" session hook that implements:
 * 1. 30-min Local cache (survives refreshes)
 * 2. Automatic sync with Better Auth state
 */
export function useSmartSession() {
  const sessionQuery = authClient.useSession();
  const [session, setSession] = useState<typeof sessionQuery.data>(null);
  const [hasLoadedCache, setHasLoadedCache] = useState(false);

  // 1. Load from localStorage ONLY after mount to fix hydration mismatch
  useEffect(() => {
    const cached = chatCache.get<any>("auth_session");
    if (cached?.data) {
      setSession(cached.data);
    }
    setHasLoadedCache(true);
  }, []);

  // 2. Sync with Better Auth and update localStorage
  useEffect(() => {
    if (!hasLoadedCache) return;

    if (sessionQuery.data) {
      setSession(sessionQuery.data);
      chatCache.set("auth_session", sessionQuery.data, undefined, undefined, 1800000); // 30 mins
    } else if (!sessionQuery.isPending && sessionQuery.data === null) {
      // User is definitely logged out
      setSession(null);
      chatCache.invalidate("auth_session");
    }
  }, [sessionQuery.data, sessionQuery.isPending, hasLoadedCache]);

  return {
    ...sessionQuery,
    data: session,
    isPending: sessionQuery.isPending && !session, // Only pending if no local cache
  };
}
