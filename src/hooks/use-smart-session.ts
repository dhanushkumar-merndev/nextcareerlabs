import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { chatCache } from "@/lib/chat-cache";
import { getAuthSessionAction } from "@/app/(auth)/auth-session";
import type { AuthSession } from "@/lib/types/auth";

type SessionData = AuthSession | null;

const CACHE_KEY = "auth_session";
const HEARTBEAT_INTERVAL = 30 * 60 * 1000; // 30 mins
const LOCAL_TTL = 100 * 365 * 24 * 60 * 60 * 1000; // ∞ forever
const VERSION_CHECK_LS_KEY = "auth_session_last_check"; // plain LS, no encryption overhead

function markVersionChecked() {
    localStorage.setItem(VERSION_CHECK_LS_KEY, Date.now().toString());
}

export function invalidateAuthSessionCache(queryClient: ReturnType<typeof useQueryClient>) {
    chatCache.invalidate(CACHE_KEY);
    localStorage.removeItem(VERSION_CHECK_LS_KEY);
    queryClient.invalidateQueries({ queryKey: [CACHE_KEY] });
    console.log("[Auth] 🗑️ Mutation: localStorage + Redis keys invalidated");
}

export function useSmartSession(initialDataFromServer?: SessionData) {
    const queryClient = useQueryClient();

    const { data: session, isLoading, refetch } = useQuery({
        queryKey: [CACHE_KEY],
        queryFn: async () => {
            const cached = chatCache.get<SessionData>(CACHE_KEY);

            // Always verify freshness via server-side version check.
            // The server action checks the actual cookie from HTTP headers
            // (the cookie is HTTP-only, so we can't read it from JS).
            // If the session expired or the user changed, the version will
            // mismatch and fresh data is fetched.
            const clientVersion = cached?.version;
            const result = await getAuthSessionAction(clientVersion);
            markVersionChecked();

            if (result.status === "not-modified" && cached?.data) {
                console.log(`[Auth] 💓 Heartbeat: Version match. localStorage is fresh.`);
                chatCache.touch(CACHE_KEY);
                return cached.data;
            }

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

                chatCache.set(CACHE_KEY, result.data, undefined, result.version, LOCAL_TTL);
                return result.data;
            }

            return cached?.data ?? null;
        },

        initialData: () => {
            if (typeof window === "undefined") return initialDataFromServer ?? undefined;
            const cached = chatCache.get<SessionData>(CACHE_KEY);
            if (cached?.data) {
                console.log(`[Auth] ⚡ Instant Hydration from localStorage`);
                return cached.data;
            }
            return initialDataFromServer ?? undefined;
        },

        initialDataUpdatedAt: () => 0,

        staleTime: HEARTBEAT_INTERVAL,
        refetchInterval: HEARTBEAT_INTERVAL,
        refetchOnWindowFocus: false,
        refetchOnMount: true,
    });

    useEffect(() => {
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
