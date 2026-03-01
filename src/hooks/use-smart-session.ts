import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { chatCache } from "@/lib/chat-cache";
import { getAuthSessionAction } from "@/app/(auth)/auth-session";

const CACHE_KEY = "auth_session";
const HEARTBEAT_INTERVAL = 30 * 60 * 1000; // 30 mins
const LOCAL_TTL = 100 * 365 * 24 * 60 * 60 * 1000; // ∞ forever
const REDIS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const VERSION_CHECK_LS_KEY = "auth_session_last_check"; // plain LS, no encryption overhead

// ── 30-min gate helpers ───────────────────────────────────────────────────────
function shouldRunVersionCheck(): boolean {
    if (typeof window === "undefined") return true;
    const last = localStorage.getItem(VERSION_CHECK_LS_KEY);
    if (!last) return true;
    return Date.now() - parseInt(last) >= HEARTBEAT_INTERVAL;
}
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
export function useSmartSession(initialDataFromServer?: any) {
    const queryClient = useQueryClient();
    const [isMounted, setIsMounted] = useState(false);

    const { data: session, isLoading, refetch } = useQuery({
        queryKey: [CACHE_KEY],
        queryFn: async () => {
            const cached = chatCache.get<any>(CACHE_KEY);

            // ✅ RULE: localStorage hit + within 30-min window → NO server call at all
            if (!shouldRunVersionCheck() && cached?.data) {
                console.log(`[Auth] ⚡ <30min window: Serving from localStorage, skipping network`);
                return cached.data;
            }

            // ✅ 30 mins passed → ONE version check via server action (hits Redis)
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
        initialData: () => {
            if (typeof window === "undefined") return initialDataFromServer ?? undefined;
            const cached = chatCache.get<any>(CACHE_KEY);
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
            const lastCheck = localStorage.getItem(VERSION_CHECK_LS_KEY);
            return lastCheck ? parseInt(lastCheck) : chatCache.get<any>(CACHE_KEY)?.timestamp;
        },

        staleTime: HEARTBEAT_INTERVAL,       // RQ won't call queryFn within 30 mins
        refetchInterval: HEARTBEAT_INTERVAL, // background heartbeat every 30 mins
        refetchOnWindowFocus: false,         // ✅ FIXED: was bypassing 30-min gate on tab switch
        refetchOnMount: false,               // ✅ FIXED: was bypassing 30-min gate on every mount
    });

    useEffect(() => {
        setIsMounted(true);

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
        isLoading: (isLoading && !session) || (!isMounted && !session && !initialDataFromServer),
        isSyncing: isLoading,
        refetch,
    };
}