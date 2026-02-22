"use client";
import { useQuery } from "@tanstack/react-query";
import { getEnrolledCourses } from "@/app/data/user/get-enrolled-courses";
import { useSmartSession } from "@/hooks/use-smart-session";
import { chatCache, PERMANENT_TTL } from "@/lib/chat-cache";

export function useEnrolledCourses() {
  const { session, isLoading: sessionLoading } = useSmartSession();
  const userId = session?.user.id;

  const query = useQuery({
    queryKey: ["enrolled_courses", userId],
    queryFn: async () => {
      if (!userId) return [];
      const cacheKey = `user_enrolled_courses_${userId}`;
      const cached = chatCache.get<any>(cacheKey, userId);
      const clientVersion = cached?.version;

      console.log(`[useEnrolledCourses] Smart Sync: Checking version (v${clientVersion || 'None'})...`);
      const result = await getEnrolledCourses(clientVersion);

      // 1. Version Match -> Return cached data
      if (result && (result as any).status === "not-modified" && cached?.data) {
        console.log(`%c[useEnrolledCourses] Server: NOT_MODIFIED (v${clientVersion})`, "color: #22c55e; font-weight: bold");
        chatCache.touch(cacheKey, userId);
        return cached.data.enrollments;
      }

      // 2. Fresh Data -> Update Local Cache
      if (result && result.enrollments) {
        console.log(`%c[useEnrolledCourses] Server: NEW_DATA -> Updating Cache (v${result.version})`, "color: #3b82f6; font-weight: bold");
        chatCache.set(cacheKey, result, userId, result.version, PERMANENT_TTL);
        return result.enrollments;
      }

      return cached?.data?.enrollments || [];
    },
    initialData: () => {
        if (typeof window === "undefined" || !userId) return undefined;
        const cacheKey = `user_enrolled_courses_${userId}`;
        const cached = chatCache.get<any>(cacheKey, userId);
        return cached?.data?.enrollments;
    },
    enabled: !!userId,
    staleTime: 1800000, // 30 mins
    refetchInterval: 1800000, // 30 mins
    refetchOnWindowFocus: true,
  });

  return {
    ...query,
    isEnrolled: (query.data?.length ?? 0) > 0,
    sessionLoading,
    userId,
  };
}
