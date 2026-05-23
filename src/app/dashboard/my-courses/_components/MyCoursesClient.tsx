"use client";

import { useEnrolledCourses } from "@/hooks/use-enrolled-courses";
import { CourseProgressCard } from "../../_components/CourseProgressCard";
import type { CourseSidebarCourseData } from "@/app/data/course/get-course-sidebar-data";
import { EmptyState } from "@/components/general/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useSmartSession } from "@/hooks/use-smart-session";

export function MyCoursesClient() {
  const { session, isLoading: sessionLoading } = useSmartSession();
  const {
    data: enrolledCourses,
    isLoading,
  } = useEnrolledCourses(session?.user?.id, sessionLoading);

  const isHydrated = typeof window !== "undefined";

  if (!isHydrated || (isLoading && !enrolledCourses)) {
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
      {enrolledCourses.map((e: { Course: CourseSidebarCourseData }) => (
        <CourseProgressCard key={e.Course.id} data={e} />
      ))}
    </div>
  );
}
