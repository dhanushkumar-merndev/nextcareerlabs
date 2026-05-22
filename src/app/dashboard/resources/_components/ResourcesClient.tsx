"use client";

import { useQuery } from "@tanstack/react-query";
import { chatCache, PERMANENT_TTL } from "@/lib/chat-cache";
import { useSmartSession } from "@/hooks/use-smart-session";
import { ChatLayoutLoader } from "@/components/chat/ChatLayoutLoader";
import { Card, CardContent } from "@/components/ui/card";
import { redirect } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

export function ResourcesClient() {
  const { session, isLoading: sessionLoading } = useSmartSession();
  const userId = session?.user.id;
  const isHydrated = typeof window !== "undefined";

  const { data: hasAccess, isLoading: checkingAccess } = useQuery({
    queryKey: ["user_resources_access", userId],
    queryFn: async () => {
      if (!userId) return false;

      const cacheKey = "user_resources_access";
      const cached = chatCache.get<boolean>(cacheKey, userId);

      // Tiered Fetch
      try {
        const res = await fetch(
          `/api/user/resources-access?version=${cached?.version || ""}`,
        );
        if (!res.ok) return cached?.data ?? false;

        const result = await res.json();

        if (result.status === "not-modified") {
          chatCache.touch(cacheKey, userId);
          chatCache.clearSync(userId);
          return cached?.data ?? false;
        }

        if (result.hasAccess !== undefined) {
          chatCache.set(
            cacheKey,
            result.hasAccess,
            userId,
            result.version,
            PERMANENT_TTL,
          );
          chatCache.clearSync(userId);
          return result.hasAccess;
        }
      } catch (e) {
        console.error("[Resources] Access check failed", e);
      }

      return cached?.data ?? false;
    },
    enabled: !!userId,
    initialData: () => {
      if (typeof window === "undefined" || !userId) return undefined;
      return chatCache.get<boolean>("user_resources_access", userId)?.data;
    },
    initialDataUpdatedAt:
      typeof window !== "undefined" && userId
        ? chatCache.get<boolean>("user_resources_access", userId)?.timestamp
        : undefined,
    staleTime: 1800000, // 30 mins
    refetchInterval: 1800000, // 30 mins
    refetchOnWindowFocus: true,
  });

  if (!isHydrated || sessionLoading || checkingAccess) {
    return (
      <Card className="flex-1 min-h-0 border-0 shadow-none bg-transparent">
        <CardContent className="p-0 h-full min-h-0">
          <Skeleton className="h-full w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (hasAccess === false && !checkingAccess && isHydrated) {
    redirect("/dashboard");
  }

  if (!userId) return null;

  return (
    <Card className="flex-1 min-h-0 border-0 shadow-none bg-transparent">
      <CardContent className="p-0 h-full min-h-0">
        <ChatLayoutLoader isAdmin={false} currentUserId={userId} />
      </CardContent>
    </Card>
  );
}
