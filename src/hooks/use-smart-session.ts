import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { chatCache } from "@/lib/chat-cache";
import { getAuthSessionAction } from "@/app/actions/auth-session";

const CACHE_KEY = "auth_session";
const HEARTBEAT_INTERVAL = 10 * 60 * 1000; // 10 minutes

/**
 * A "Smart" session hook that:
 * 1. Loads instantly from LocalStorage on mount (Instant UI)
 * 2. Background Heartbeat every 10 mins (via Server Action)
 * 3. Minimizes data transfer using Versioning
 */
export function useSmartSession() {
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
                chatCache.set(CACHE_KEY, result.data, undefined, result.version, 6 * 60 * 60 * 1000);
                return result.data;
            }

            return null;
        },
        initialData: () => {
            if (typeof window === "undefined") return undefined;
            const cached = chatCache.get<any>(CACHE_KEY);
            if (cached?.data) {
                console.log(`[Auth] � Instant Hydration from LocalStorage`);
                return cached.data;
            }
            return undefined;
        },
        staleTime: HEARTBEAT_INTERVAL,
        refetchInterval: HEARTBEAT_INTERVAL,
        refetchOnWindowFocus: true,
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
        isLoading: !isMounted || (isLoading && !session),
        refetch
    };
}
