"use client";

import { useQuery } from "@tanstack/react-query";
import { getUserDashboardData } from "@/app/dashboard/actions";
import { chatCache, PERMANENT_TTL } from "@/lib/chat-cache";
import { AnalyticsCard } from "@/components/analytics/AnalyticsCard";
import { HorizontalCourseCard } from "../_components/HorizontalCourseCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useSmartSession } from "@/hooks/use-smart-session";
import { useEffect, useState, useRef } from "react";

export function DashboardClient() {
  const { session, isLoading: sessionLoading } = useSmartSession();
  const userId = session?.user.id;

  const [mounted, setMounted] = useState(false);
  const hasLogged = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["user_dashboard", userId],
    queryFn: async () => {
      if (!userId) return null;
      const cacheKey = "user_dashboard";
      const cached = chatCache.get<any>(cacheKey, userId);
      const clientVersion = cached?.version;

      console.log(`[Dashboard] Smart Sync: Checking version (v${clientVersion || 'None'})...`);
      const result = await getUserDashboardData(userId, clientVersion);

      // 1. Version Match -> Return cached data
      // Server says cache is still valid
      if (result && (result as any).status === "not-modified") {
        console.log(`%c[Dashboard] Server: NOT_MODIFIED (v${clientVersion})`, "color: #eab308; font-weight: bold");
        chatCache.touch(cacheKey, userId);
        if (userId) chatCache.clearSync(userId);
        return cached?.data || null; // Ensure we return cached data if available, or null
      }

      // 2. Fresh Data -> Update Local Cache (Permanent TTL)
      if (result && result.data) {
        console.log(`%c[Dashboard] Server: NEW_DATA -> Updating Cache (v${result.version})`, "color: #3b82f6; font-weight: bold");
        chatCache.set(cacheKey, result.data, userId, result.version, PERMANENT_TTL);
        if (userId) chatCache.clearSync(userId);
        return result.data;
      }
      
      return cached?.data || null;
    },
    initialData: () => {
      if (typeof window === "undefined" || !userId) return undefined;
      return chatCache.get<any>("user_dashboard", userId)?.data;
    },
    initialDataUpdatedAt: typeof window !== "undefined" && userId 
      ? chatCache.get<any>("user_dashboard", userId)?.timestamp 
      : undefined,
    staleTime: 1800000, // 30 mins
    refetchInterval: 1800000, // 30 mins
    refetchOnWindowFocus: true,
  });

  if (!mounted || sessionLoading || (isLoading && !data)) {
    return (
      <div className="flex-1 space-y-4">
        {/* Top Stats Skeletons */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card border border-border/10 rounded-3xl p-6 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4 rounded-full" />
              </div>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>

        {/* Courses Section Skeleton */}
        <div className="space-y-6 pt-6">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>

          <div className="flex flex-col gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex flex-col sm:flex-row gap-4 p-4 rounded-3xl border border-border/10 bg-muted/5">
                <Skeleton className="aspect-video w-full sm:w-48 rounded-2xl" />
                <div className="flex-1 space-y-3 py-2">
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                  <div className="space-y-2 pt-2">
                    <div className="flex justify-between">
                      <Skeleton className="h-4 w-12" />
                      <Skeleton className="h-4 w-12" />
                    </div>
                    <Skeleton className="h-2 w-full rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return <div>Failed to load dashboard data.</div>;

  return (
    <div className="flex-1 space-y-4">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <AnalyticsCard
          title="Enrolled Courses"
          value={data.enrolledCoursesCount}
          icon="book-text"
          description="Active learning paths"
        />
        <AnalyticsCard
          title="Completed Courses"
          value={data.completedCoursesCount}
          icon="circle-check"
          description="Successfully finished"
        />
        <AnalyticsCard
          title="Chapters Finished"
          value={data.completedChaptersCount}
          icon="layers"
          description="Milestones reached"
        />
        <AnalyticsCard
          title="Lessons Finished"
          value={data.totalCompletedLessons}
          icon="check-circle"
          description="Total content consumption"
        />
      </div>

      <div className="space-y-6 pt-6">
        <div className="flex flex-col gap-1">
            <h3 className="text-xl font-black tracking-tight text-foreground uppercase">
                Course Progress
            </h3>
            <p className="text-sm text-muted-foreground/60 font-medium">
                Detailed breakdown of learning progress for each course.
            </p>
        </div>

        {data.coursesProgress?.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 rounded-3xl border border-dashed border-border/20 bg-muted/5">
             <p className="text-muted-foreground font-medium italic">You are not enrolled in any courses yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {data.coursesProgress?.map((course: any, index: number) => (
              <HorizontalCourseCard
                key={course.id}
                course={course}
                index={index}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
