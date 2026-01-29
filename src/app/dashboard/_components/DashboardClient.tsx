"use client";

import { useQuery } from "@tanstack/react-query";
import { getUserDashboardData } from "@/app/dashboard/actions";
import { chatCache } from "@/lib/chat-cache";
import { AnalyticsCard } from "@/components/analytics/AnalyticsCard";
import { HorizontalCourseCard } from "../_components/HorizontalCourseCard";

interface DashboardClientProps {
    userId: string;
    initialData?: any;
    initialVersion?: string | null;
}

import { useEffect, useState } from "react";

export function DashboardClient({ userId, initialData, initialVersion }: DashboardClientProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync initialData to local storage on mount to keep local cache fresh
  // Removed redundant useEffect sync to avoid hydration flickers
  // Sync now happens during query execution

  const { data, isLoading } = useQuery({
    queryKey: ["user_dashboard", userId],
    queryFn: async () => {
      const cacheKey = `user_dashboard_${userId}`;
      const cached = chatCache.get<any>(cacheKey, userId);
      const clientVersion = cached?.version;

      console.log(`[Dashboard] Syncing with server... (Client Version: ${clientVersion || 'None'})`);
      const result = await getUserDashboardData(userId, clientVersion);

      if (result && (result as any).status === "not-modified" && cached) {
        console.log(`[Dashboard] Version matches. Keeping local data.`);
        return cached.data;
      }

      if (result && !(result as any).status) {
        console.log(`[Dashboard] Received fresh dashboard data.`);
        chatCache.set(cacheKey, result, userId, (result as any).version);
      }
      return result;
    },
    initialData: () => {
      // ⭐ PRIORITY 1: Server-provided data (Source of Truth for fresh refresh)
      if (initialData) return initialData;

      if (!mounted) return undefined;

      // ⭐ PRIORITY 2: Local Cache (For fast navigation/stale state)
      const cacheKey = `user_dashboard_${userId}`;
      const cached = chatCache.get<any>(cacheKey, userId);
      if (cached) {
        return cached.data;
      }
      return undefined;
    },
    staleTime: 1800000, // 30 mins
    refetchOnWindowFocus: true,
  });

  if (isLoading && !data) {
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
            {data.coursesProgress?.map((course: any) => (
              <HorizontalCourseCard
                key={course.id}
                course={course}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
