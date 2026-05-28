"use client";

import { useQuery } from "@tanstack/react-query";
import { chatCache, PERMANENT_TTL } from "@/lib/chat-cache";
import { useSmartSession } from "@/hooks/use-smart-session";
import { ChatLayoutLoader } from "@/components/chat/ChatLayoutLoader";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function ResourcesClient() {
  const router = useRouter();
  const { session, isLoading: sessionLoading } = useSmartSession();
  const redirectedRef = useRef(false);
  const userId = session?.user.id;
  const isHydrated = typeof window !== "undefined";

  const { data: hasAccess, isLoading: checkingAccess } = useQuery({
    queryKey: ["user_resources_access", userId],
    queryFn: async () => {
      if (!userId) return false;

      const cacheKey = "user_resources_access";
      const cached = chatCache.get<boolean>(cacheKey, userId);

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
    staleTime: 1800000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (hasAccess === false && !checkingAccess && isHydrated && !redirectedRef.current) {
      redirectedRef.current = true;
      toast.info("You haven't enrolled in any course yet");
      router.replace("/dashboard");
    }
  }, [hasAccess, checkingAccess, isHydrated, router]);

  if (!isHydrated || sessionLoading || checkingAccess) {
    return (
      <Card className="flex-1 min-h-0 border-0 shadow-none bg-transparent">
        <CardContent className="p-0 h-full min-h-0">
          <Skeleton className="h-full w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (!userId) return null;

  if (hasAccess === false) return null;

  return (
    <Card className="flex-1 min-h-0 border-0 shadow-none bg-transparent">
      <CardContent className="p-0 h-full min-h-0">
        <ChatLayoutLoader isAdmin={false} currentUserId={userId} />
      </CardContent>
    </Card>
  );
}
