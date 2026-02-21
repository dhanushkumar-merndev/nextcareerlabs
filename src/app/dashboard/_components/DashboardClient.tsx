"use client";

import { useQuery } from "@tanstack/react-query";
import { getUserDashboardData } from "@/app/dashboard/actions";
import { chatCache, PERMANENT_TTL } from "@/lib/chat-cache";
import { AnalyticsCard } from "@/components/analytics/AnalyticsCard";
import { HorizontalCourseCard } from "../_components/HorizontalCourseCard";

import { useSmartSession } from "@/hooks/use-smart-session";

import { useEffect, useState } from "react";

export function DashboardClient() {
  const { session, isLoading: sessionLoading } = useSmartSession();
  const userId = session?.user.id;

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["user_dashboard", userId],
    queryFn: async () => {
      if (!userId) return null;
      const cacheKey = `user_dashboard_${userId}`;
      const cached = chatCache.get<any>(cacheKey, userId);
      const clientVersion = cached?.version;

      // 🛑 SYNC GUARD: If we synced within the last 60s, skip network hit entirely
      const isRecent = chatCache.isRecentSync(cacheKey, userId, 60000);
      if (isRecent && cached?.data) {
        console.log(`%c[Dashboard] Sync Guard: Recently synced. Skipping server check.`, "color: #a855f7; font-weight: bold");
        return cached.data;
      }

      console.log(`[Dashboard] Smart Sync: Checking version (v${clientVersion || 'None'})...`);
      const result = await getUserDashboardData(userId, clientVersion);

      // 1. Version Match -> Return cached data
      // Server says cache is still valid
      if (result && (result as any).status === "not-modified") {
        console.log(`%c[Dashboard] Server: NOT_MODIFIED (v${clientVersion})`, "color: #22c55e; font-weight: bold");
        chatCache.touch(cacheKey, userId); // Refresh sync guard timer
        return cached?.data || null; // Ensure we return cached data if available, or null
      }

      // 2. Fresh Data -> Update Local Cache (Permanent TTL)
      if (result && result.data) {
        console.log(`%c[Dashboard] Server: NEW_DATA -> Updating Cache (v${result.version})`, "color: #3b82f6; font-weight: bold");
        chatCache.set(cacheKey, result.data, userId, result.version, PERMANENT_TTL);
        return result.data;
      }
      
      return cached?.data || null;
    },
    initialData: () => {
      if (typeof window === "undefined" || !userId) return undefined;

      const cacheKey = `user_dashboard_${userId}`;
      const cached = chatCache.get<any>(cacheKey, userId);
      if (cached?.data) {
          console.log(`%c[Dashboard] LOCAL HIT (v${cached.version}). Instant Hydration.`, "color: #eab308; font-weight: bold");
          return cached.data;
      }
      return undefined;
    },
    staleTime: 1800000, // 30 mins (Heartbeat)
    refetchInterval: 1800000, // 30 mins
    refetchOnWindowFocus: true,
  });

  if (!mounted || sessionLoading || (isLoading && !data)) {
    return (
        <div className="flex items-center justify-center p-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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
