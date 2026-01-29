"use client";

import { useQuery } from "@tanstack/react-query";
import { getEnrolledCourses } from "@/app/data/user/get-enrolled-courses";
import { chatCache } from "@/lib/chat-cache";
import { CourseProgressCard } from "../../_components/CourseProgressCard";
import { EmptyState } from "@/components/general/EmptyState";
import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function MyCoursesClient({ userId, initialData }: { userId: string, initialData?: any }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: enrolledCourses, isLoading } = useQuery({
    queryKey: ["enrolled_courses", userId],
    queryFn: async () => {
      const cacheKey = `user_enrolled_courses_${userId}`;
      const cached = chatCache.get<any>(cacheKey, userId);
      const clientVersion = cached?.version;

      console.log(`[MyCourses] Syncing for ${userId}...`);
      const result = await getEnrolledCourses(clientVersion);

      if (result && (result as any).status === "not-modified" && cached) {
        return cached.data.enrollments;
      }

      if (result && !(result as any).status) {
        chatCache.set(cacheKey, result, userId, (result as any).version);
        return (result as any).enrollments;
      }
      return (result as any)?.enrollments || [];
    },
    initialData: () => {
        if (initialData) return initialData.enrollments || initialData;
        if (!mounted) return undefined;
        const cacheKey = `user_enrolled_courses_${userId}`;
        const cached = chatCache.get<any>(cacheKey, userId);
        if (cached) {
            return cached.data.enrollments;
        }
        return undefined;
    },
    staleTime: 1800000, // 30 mins
  });

  if (isLoading && !enrolledCourses) {
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
