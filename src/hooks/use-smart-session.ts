import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { chatCache } from "@/lib/chat-cache";
import { getAuthSessionAction } from "@/app/(auth)/auth-session";

const CACHE_KEY = "auth_session";
const HEARTBEAT_INTERVAL = 30 * 60 * 1000; // 30 minutes

/**
 * A "Smart" session hook that:
 * 1. Loads instantly from LocalStorage on mount (Instant UI)
 * 2. Background Heartbeat every 30 mins (via Server Action)
 * 3. Minimizes data transfer using Versioning
 */
export function useSmartSession(initialDataFromServer?: any) {
    const queryClient = useQueryClient();
    const [isMounted, setIsMounted] = useState(false);

    const { data: session, isLoading, refetch } = useQuery({
        queryKey: [CACHE_KEY],
        queryFn: async () => {
            const cached = chatCache.get<any>(CACHE_KEY);
            const clientVersion = cached?.version;

            // Call our "Smart" Server Action
            const result = await getAuthSessionAction(clientVersion);

            // Handle server "not-modified" response
            if (result.status === "not-modified" && cached?.data) {
                console.log(`[Auth] 💓 Heartbeat: Version Match. Using cache.`);
                return cached.data;
            }

            // Fresh data received -> Update LocalStorage
            if (result.data !== undefined) {
                console.log(`[Auth] 🛰️ Sync: New session data received (v${result.version})`);
                
                if (clientVersion && clientVersion !== result.version) {
                    console.warn(`%c[Auth] Global version mismatch detected! Syncing...`, "color: #ef4444; font-weight: bold");
                    
                    const uid = result.data?.user?.id || cached?.data?.user?.id;
                    if (uid) {
                        chatCache.invalidateUserDashboardData(uid);
                    }
                    
                    chatCache.invalidateAllCourseData();
                    queryClient.invalidateQueries({ queryKey: ["user_dashboard"] });
                    queryClient.invalidateQueries({ queryKey: ["course_detail"] });
                    queryClient.invalidateQueries({ queryKey: ["enrolled_courses"] });
                    queryClient.invalidateQueries({ queryKey: ["available_courses"] });
                }

                chatCache.set(CACHE_KEY, result.data, undefined, result.version, 30 * 24 * 60 * 60 * 1000);
                return result.data;
            }

            return null;
        },
        initialData: () => {
            if (typeof window === "undefined") return undefined;
            const cached = chatCache.get<any>(CACHE_KEY);
            if (cached?.data) {
                console.log(`[Auth] ⚡ Instant Hydration from LocalStorage`);
                return cached.data;
            }
            return undefined;
        },
        initialDataUpdatedAt: () => {
            if (typeof window === "undefined") return undefined;
            return chatCache.get<any>(CACHE_KEY)?.timestamp;
        },
        staleTime: HEARTBEAT_INTERVAL,
        refetchInterval: HEARTBEAT_INTERVAL,
        refetchOnWindowFocus: true,
        refetchOnMount: true,
    });

    useEffect(() => {
        setIsMounted(true);

        // Cross-tab Synchronization
        const handleStorage = (e: StorageEvent) => {
            if (e.key?.includes(CACHE_KEY)) {
                console.log(`[Auth] 🔄 Cross-tab Sync: Invalidation detected`);
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
        refetch
    };
}  