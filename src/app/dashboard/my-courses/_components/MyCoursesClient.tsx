"use client";

import { useQuery } from "@tanstack/react-query";
import { getEnrolledCourses } from "@/app/data/user/get-enrolled-courses";
import { useSmartSession } from "@/hooks/use-smart-session";
import { chatCache, PERMANENT_TTL } from "@/lib/chat-cache";
import { CourseProgressCard } from "../../_components/CourseProgressCard";
import { EmptyState } from "@/components/general/EmptyState";
import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function MyCoursesClient() {
  const { session, isLoading: sessionLoading } = useSmartSession();
  const userId = session?.user.id;

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: enrolledCourses, isLoading } = useQuery({
    queryKey: ["enrolled_courses", userId],
    queryFn: async () => {
      if (!userId) return [];
      const cacheKey = `user_enrolled_courses_${userId}`;
      const cached = chatCache.get<any>(cacheKey, userId);
      const clientVersion = cached?.version;

      // 🛑 SYNC GUARD: If we synced within the last 60s, skip network hit entirely
      const isRecent = chatCache.isRecentSync(cacheKey, userId, 60000);
      if (isRecent && cached?.data) {
        console.log(`%c[MyCourses] Sync Guard: Recently synced. Skipping server check.`, "color: #a855f7; font-weight: bold");
        return cached.data.enrollments;
      }

      console.log(`[MyCourses] Smart Sync: Checking version (v${clientVersion || 'None'})...`);
      const result = await getEnrolledCourses(clientVersion);

      // 1. Version Match -> Return cached data
      if (result && (result as any).status === "not-modified" && cached?.data) {
        console.log(`%c[MyCourses] Server: NOT_MODIFIED (v${clientVersion})`, "color: #22c55e; font-weight: bold");
        chatCache.touch(cacheKey, userId);
        return cached.data.enrollments;
      }

      // 2. Fresh Data -> Update Local Cache (Permanent TTL)
      if (result && result.enrollments) {
        console.log(`%c[MyCourses] Server: NEW_DATA -> Updating Cache (v${result.version})`, "color: #3b82f6; font-weight: bold");
        chatCache.set(cacheKey, result, userId, result.version, PERMANENT_TTL);
        return result.enrollments;
      }

      return cached?.data?.enrollments || [];
    },
    initialData: () => {
        if (typeof window === "undefined" || !userId) return undefined;

        const cacheKey = `user_enrolled_courses_${userId}`;
        const cached = chatCache.get<any>(cacheKey, userId);
        if (cached?.data?.enrollments) {
            console.log(`%c[MyCourses] LOCAL HIT (v${cached.version}). Instant Hydration.`, "color: #eab308; font-weight: bold");
            return cached.data.enrollments;
        }
        return undefined;
    },
    staleTime: 1800000, // 30 mins (Heartbeat)
    refetchInterval: 1800000, // 30 mins
    refetchOnWindowFocus: true,
  });

  if (!mounted || sessionLoading || (isLoading && !enrolledCourses)) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-4">
            <Skeleton className="aspect-video w-full rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!enrolledCourses || enrolledCourses.length === 0) {
    return (
      <EmptyState
        title="No courses enrolled"
        description="You haven't enrolled in any courses yet."
        buttonText="Browse Courses"
        href="/dashboard/available-courses"
      />
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {enrolledCourses.map((e: any) => (
        <CourseProgressCard key={e.Course.id} data={e} />
      ))}
    </div>
  );
}
