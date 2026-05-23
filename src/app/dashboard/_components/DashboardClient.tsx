"use client";

import { useQuery } from "@tanstack/react-query";
import { getUserDashboardData } from "@/app/dashboard/actions";
import { chatCache, PERMANENT_TTL } from "@/lib/chat-cache";
import { AnalyticsCard } from "@/components/analytics/AnalyticsCard";
import { HorizontalCourseCard } from "../_components/HorizontalCourseCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";

interface LessonProgress {
  id: string;
  duration: number;
  restrictionTime: number;
  completed: boolean;
}

interface CourseProgress {
  id: string;
  title: string;
  imageUrl: string;
  progress: number;
  totalLessons: number;
  completedLessons: number;
  actualWatchTime: number;
  slug: string;
  level: string;
  firstLessonId: string | null;
  lessonsProgress: LessonProgress[];
}

interface DashboardData {
  enrolledCoursesCount: number;
  completedCoursesCount: number;
  completedChaptersCount: number;
  totalCompletedLessons: number;
  totalPlatformActualWatchTime: number;
  coursesProgress: CourseProgress[];
}

export function DashboardClient({
  initialData: ssrData,
  initialVersion,
  userId,
}: {
  initialData?: DashboardData | null;
  initialVersion?: string | null;
  userId: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["user_dashboard", userId],
    queryFn: async () => {
      if (!userId) return null;
      const cacheKey = "user_dashboard";
      const cached = chatCache.get<DashboardData>(cacheKey, userId);
      const clientVersion = cached?.version || initialVersion;

      console.log(
        `[Dashboard] Smart Sync: Checking version (v${clientVersion || "None"})...`,
      );
      const result = await getUserDashboardData(clientVersion ?? undefined);

      if (result && "status" in result && result.status === "not-modified") {
        console.log(
          `%c[Dashboard] Server: NOT_MODIFIED (v${clientVersion})`,
          "color: #eab308; font-weight: bold",
        );
        chatCache.touch(cacheKey, userId);
        if (userId) chatCache.clearSync(userId);
        return cached?.data || ssrData || null;
      }

      if (result && result.data) {
        console.log(
          `%c[Dashboard] SERVER HIT: NEW_DATA. Updating Local Cache (v${result.version}).`,
          "color: #eab308; font-weight: bold",
        );
        chatCache.set(
          cacheKey,
          result.data,
          userId,
          result.version,
          PERMANENT_TTL,
        );
        if (userId) chatCache.clearSync(userId);
        return result.data;
      }

      return cached?.data || ssrData || null;
    },
    initialData: ssrData ?? undefined,
    staleTime: 1800000,
    refetchInterval: 1800000,
    refetchOnWindowFocus: true,
  });

  if (isLoading && !data) {
    return (
      <div className="flex-1 space-y-4">
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="group rounded-xl border bg-card transition-all duration-300 hover:shadow-lg hover:-translate-y-1 cursor-default py-4 gap-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardDescription className="text-sm font-medium">
                    <Skeleton className="h-4 w-24" />
                  </CardDescription>
                  <CardTitle className="text-3xl font-semibold tabular-nums mt-1">
                    <Skeleton className="h-8 w-16" />
                  </CardTitle>
                </div>
                <div className="p-2 rounded-md bg-primary/10">
                  <Skeleton className="size-6 rounded" />
                </div>
              </CardHeader>
              <CardFooter className="flex flex-col items-start gap-1 pb-1">
                <Skeleton className="h-3 w-32" />
              </CardFooter>
            </Card>
          ))}
        </div>

        <div className="space-y-6 pt-6">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>

          <div className="flex flex-col gap-4">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="flex flex-col sm:flex-row gap-4 p-4 rounded-3xl border border-border/10 bg-muted/5"
              >
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
            <p className="text-muted-foreground font-medium italic">
              You are not enrolled in any courses yet.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {data.coursesProgress?.map((course) => (
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
