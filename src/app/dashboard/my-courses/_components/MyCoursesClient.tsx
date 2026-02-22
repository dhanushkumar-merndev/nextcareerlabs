"use client";

import { useEnrolledCourses } from "@/hooks/use-enrolled-courses";
import { CourseProgressCard } from "../../_components/CourseProgressCard";
import { EmptyState } from "@/components/general/EmptyState";
import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function MyCoursesClient() {
  const { 
    data: enrolledCourses, 
    isLoading, 
    sessionLoading 
  } = useEnrolledCourses();

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
