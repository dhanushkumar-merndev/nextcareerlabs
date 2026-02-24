"use client";
import { useQuery } from "@tanstack/react-query";
import { getEnrolledCourses } from "@/app/data/user/get-enrolled-courses";
import { chatCache, PERMANENT_TTL } from "@/lib/chat-cache";

export function useEnrolledCourses(
  userId?: string,
  sessionLoading?: boolean
) {
  const getCached = () => {
    if (typeof window === "undefined" || !userId) return undefined;
    return (
      chatCache.get<any>(`user_enrolled_courses_${userId}`, userId) ??
      undefined
    );
  };

  const query = useQuery({
    queryKey: ["enrolled_courses", userId],
    queryFn: async () => {
      if (!userId) return [];

      const cacheKey = `user_enrolled_courses_${userId}`;
      const cached = chatCache.get<any>(cacheKey, userId);
      const clientVersion = cached?.version;

      const result = await getEnrolledCourses(clientVersion);

      if (result && (result as any).status === "not-modified" && cached?.data) {
        chatCache.touch(cacheKey, userId);
        chatCache.clearSync(userId);
        return cached.data.enrollments;
      }

      if (result && result.enrollments) {
        chatCache.set(cacheKey, result, userId, result.version, PERMANENT_TTL);
        chatCache.clearSync(userId);
        return result.enrollments;
      }

      return cached?.data?.enrollments ?? [];
    },
    enabled: !!userId && !sessionLoading,
    initialData: () => getCached()?.data?.enrollments,
    initialDataUpdatedAt: () => getCached()?.timestamp,
    staleTime: 1800000,
    refetchOnWindowFocus: true,
  });

  return {
    ...query,
    isEnrolled: (query.data?.length ?? 0) > 0,
  };
}