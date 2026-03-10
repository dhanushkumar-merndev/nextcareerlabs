"use client";
import { useQuery } from "@tanstack/react-query";
import { chatCache, PERMANENT_TTL } from "@/lib/chat-cache";

export function useEnrolledCourses(userId?: string, sessionLoading?: boolean) {
  const getCached = () => {
    if (typeof window === "undefined" || !userId) return undefined;
    const cached = chatCache.get<any>("user_enrolled_courses", userId);
    if (cached) {
      console.log(
        `%c[EnrolledCourses] LOCAL HIT (v${cached.version}). Rendering from device storage.`,
        "color: #eab308; font-weight: bold",
      );
    }
    return cached ?? undefined;
  };

  const query = useQuery({
    queryKey: ["enrolled_courses", userId],
    queryFn: async () => {
      if (!userId) return [];

      const cacheKey = "user_enrolled_courses";
      const cached = chatCache.get<any>(cacheKey, userId);
      const clientVersion = cached?.version;

      try {
        const response = await fetch(
          `/api/user/enrolled-courses${clientVersion ? `?version=${clientVersion}` : ""}`,
        );
        if (!response.ok) throw new Error("Failed to fetch enrolled courses");

        const result = await response.json();

        // NOT_MODIFIED -> use localStorage
        if (result.status === "not-modified") {
          console.log(
            `%c[EnrolledCourses] SERVER HIT: NOT_MODIFIED. Syncing from device storage.`,
            "color: #eab308; font-weight: bold",
          );
          chatCache.touch(cacheKey, userId);
          return cached?.data?.enrollments ?? [];
        }

        // Fresh data -> update localStorage
        if (result.enrollments) {
          console.log(
            `%c[EnrolledCourses] SERVER HIT: NEW_DATA. Updating Local Cache (v${result.version}).`,
            "color: #eab308; font-weight: bold",
          );
          chatCache.set(
            cacheKey,
            result,
            userId,
            result.version,
            PERMANENT_TTL,
          );
          chatCache.clearSync(userId);
          return result.enrollments;
        }
      } catch (error) {
        console.error("[useEnrolledCourses] Fetch error:", error);
      }

      return cached?.data?.enrollments ?? [];
    },
    enabled: !!userId && !sessionLoading,
    initialData: () => getCached()?.data?.enrollments,
    initialDataUpdatedAt:
      typeof window !== "undefined" && userId
        ? chatCache.get<any>("user_enrolled_courses", userId)?.timestamp
        : undefined,
    staleTime: 1800000, // 30 mins
    refetchInterval: 1800000, // 30 mins
    refetchOnWindowFocus: true,
  });

  return {
    ...query,
    isEnrolled: (query.data?.length ?? 0) > 0,
  };
}
