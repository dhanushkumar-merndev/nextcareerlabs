import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { chatCache } from "@/lib/chat-cache";
import { getAuthSessionAction } from "@/app/(auth)/auth-session";
import type { AuthSession } from "@/lib/types/auth";

type SessionData = AuthSession | null;

const CACHE_KEY = "auth_session";
const HEARTBEAT_INTERVAL = 30 * 60 * 1000; // 30 mins
const LOCAL_TTL = 100 * 365 * 24 * 60 * 60 * 1000; // ∞ forever
const VERSION_CHECK_LS_KEY = "auth_session_last_check"; // plain LS, no encryption overhead

const SESSION_COOKIE = "better-auth.session_token";
const FALLBACK_COOKIE = "next-auth.session-token";

// ── Client-side cookie helpers ─────────────────────────────────────────────────
function hasSessionCookie(): boolean {
    if (typeof document === "undefined") return false;
    return document.cookie.includes(SESSION_COOKIE) || document.cookie.includes(FALLBACK_COOKIE);
}

// NOTE: can't read actual cookie value here (httpOnly), just its presence/absence.

// ── 30-min gate helpers ───────────────────────────────────────────────────────
function markVersionChecked() {
    localStorage.setItem(VERSION_CHECK_LS_KEY, Date.now().toString());
}

// ── Call on ANY mutation (create/update/delete) ───────────────────────────────
export function invalidateAuthSessionCache(queryClient: ReturnType<typeof useQueryClient>) {
    chatCache.invalidate(CACHE_KEY);               // wipe localStorage (secureStorage)
    localStorage.removeItem(VERSION_CHECK_LS_KEY); // reset 30-min timer
    queryClient.invalidateQueries({ queryKey: [CACHE_KEY] }); // force fresh fetch
    console.log("[Auth] 🗑️ Mutation: localStorage + Redis keys invalidated");
}

/**
 * Flow:
 * localStorage (∞) → version check every 30 mins (ONE call) → Redis (30d)
 * On mutation → invalidateAuthSessionCache() nukes both stores
 */
export function useSmartSession(initialDataFromServer?: SessionData) {
    const queryClient = useQueryClient();

    const { data: session, isLoading, refetch } = useQuery({
        queryKey: [CACHE_KEY],
        queryFn: async () => {
            const cached = chatCache.get<SessionData>(CACHE_KEY);

            // ── Detect session cookie on client side ──────────────────────────
            const hasCookie = hasSessionCookie();

            // No session cookie → user is definitely logged out
            if (!hasCookie) {
                if (cached?.data) {
                    console.log(`[Auth] 🔴 No session cookie but cached data exists. Clearing stale cache.`);
                    chatCache.invalidate(CACHE_KEY);
                    localStorage.removeItem(VERSION_CHECK_LS_KEY);
                }
                return null;
            }

            // ✅ Session cookie exists → ALWAYS do version check (bypasses 30-min gate).
            //    The version check is cheap (just Redis key reads) and is the only
            //    reliable way to detect a user change after session expiry + re-login
            //    with a different Google account. We cannot safely reuse cached data
            //    within the 30-min window because the cookie might belong to a
            //    different user than the cached session data.
            const clientVersion = cached?.version;
            const result = await getAuthSessionAction(clientVersion);
            markVersionChecked(); // stamp immediately so concurrent calls don't double-fire

            // Version match → touch localStorage, return cached (no data transfer)
            if (result.status === "not-modified" && cached?.data) {
                console.log(`[Auth] 💓 Heartbeat: Version match. localStorage is fresh.`);
                chatCache.touch(CACHE_KEY); // refresh timestamp, keep data intact
                return cached.data;
            }

            // Fresh data from Redis/DB → update localStorage (∞) 
            if (result.data !== undefined) {
                console.log(`[Auth] 🛰️ Sync: New session received (v${result.version})`);

                if (clientVersion && clientVersion !== result.version) {
                    console.warn(`%c[Auth] Version mismatch! Busting all caches...`, "color: #ef4444; font-weight: bold");
                    const uid = result.data?.user?.id || cached?.data?.user?.id;
                    if (uid) chatCache.invalidateUserDashboardData(uid);
                    chatCache.invalidateAllCourseData();
                    queryClient.invalidateQueries({ queryKey: ["user_dashboard"] });
                    queryClient.invalidateQueries({ queryKey: ["course_detail"] });
                    queryClient.invalidateQueries({ queryKey: ["enrolled_courses"] });
                    queryClient.invalidateQueries({ queryKey: ["available_courses"] });
                }

                // localStorage = ∞, Redis TTL managed server-side (30 days)
                chatCache.set(CACHE_KEY, result.data, undefined, result.version, LOCAL_TTL);
                return result.data;
            }

            return cached?.data ?? null;
        },

        // ✅ Instant hydration: sync localStorage read before first render
        //    When no session cookie exists, don't serve stale cached data
        initialData: () => {
            if (typeof window === "undefined") return initialDataFromServer ?? undefined;
            if (!hasSessionCookie()) {
                return null;
            }
            const cached = chatCache.get<SessionData>(CACHE_KEY);
            if (cached?.data) {
                console.log(`[Auth] ⚡ Instant Hydration from localStorage`);
                return cached.data;
            }
            return initialDataFromServer ?? undefined;
        },

        // ✅ CRITICAL: must point to last VERSION CHECK time, not cache write time
        // This makes React Query's staleTime clock align with your 30-min gate
        initialDataUpdatedAt: () => {
            if (typeof window === "undefined") return undefined;
            if (!hasSessionCookie()) return 0;
            const lastCheck = localStorage.getItem(VERSION_CHECK_LS_KEY);
            return lastCheck ? parseInt(lastCheck) : chatCache.get<SessionData>(CACHE_KEY)?.timestamp;
        },

        staleTime: HEARTBEAT_INTERVAL,       // RQ won't call queryFn within 30 mins
        refetchInterval: HEARTBEAT_INTERVAL, // background heartbeat every 30 mins
        refetchOnWindowFocus: false,         // ✅ FIXED: was bypassing 30-min gate on tab switch
        refetchOnMount: false,               // ✅ FIXED: was bypassing 30-min gate on every mount
    });

    // ── Mount validation: detect cookie-cache mismatch ─────────────────────────
    // On the first mount of any useSmartSession instance, if a session cookie
    // exists, force a version check. This catches the case where the user changed
    // (e.g., session expired → re-login with a different Google account) but the
    // localStorage still has the old user's cached session data.
    const validatedOnMount = useRef(false);
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (validatedOnMount.current) return;
        validatedOnMount.current = true;

        if (hasSessionCookie()) {
            console.log(`[Auth] 🔄 Mount: session cookie detected, validating...`);
            queryClient.invalidateQueries({ queryKey: [CACHE_KEY] });
        }
    }, [queryClient]);

    useEffect(() => {
        // Cross-tab: listen for mutation signal (VERSION_CHECK_LS_KEY removal = mutation happened)
        const handleStorage = (e: StorageEvent) => {
            if (e.key === VERSION_CHECK_LS_KEY && e.newValue === null) {
                console.log(`[Auth] 🔄 Cross-tab: Mutation detected, re-syncing`);
                queryClient.invalidateQueries({ queryKey: [CACHE_KEY] });
            }
        };

        window.addEventListener("storage", handleStorage);
        return () => window.removeEventListener("storage", handleStorage);
    }, [queryClient]);

    return {
        session,
        user: session?.user || null,
        isLoading: isLoading && !session,
        isSyncing: isLoading,
        refetch,
    };
}