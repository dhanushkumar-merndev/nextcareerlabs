/* This component is used to display the list of courses */

"use client";
import { useQuery } from "@tanstack/react-query";
import { getAllCoursesAction } from "../actions";
import { chatCache } from "@/lib/chat-cache";
import {
  PublicCourseCard,
  PublicCourseCardSkeleton,
} from "../../_components/PublicCourseCard";
import { useEffect, useState } from "react";
import { Course, CoursesClientProps, } from "@/lib/types/course";

export function CoursesClient({ currentUserId }: CoursesClientProps) {
  const [mounted, setMounted] = useState(false);
  const safeUserId = currentUserId ?? undefined;
  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
    console.log("[CoursesClient] mounted");
  }, []);

  /**
   * Data flow priority:
   * 1. Local in-memory cache (30 mins)
   * 2. Server version check
   * 3. Redis cache (6 hours)
   * 4. Database
   *
   * React Query ALWAYS receives Course[]
   */
  const { data: courses = [], isLoading } = useQuery<Course[]>({
    queryKey: ["all_courses", safeUserId],

    queryFn: async () => {
      console.log("[CoursesClient] queryFn called");

      const cached = chatCache.get<Course[]>("all_courses", safeUserId);
      const clientVersion = cached?.version;

      console.log("[CoursesClient] local cache:", {
        hasCache: !!cached,
        version: clientVersion,
        items: cached?.data?.length ?? 0,
      });
      
      const result = await getAllCoursesAction(clientVersion, safeUserId);
      console.log("[CoursesClient] server result:", result);

      // 🔁 Version match → use local cache
      if (result.status === "not-modified") {
        console.log("[CoursesClient] NOT_MODIFIED → using local cache");
        return cached?.data ?? [];
      }

      // 🆕 Fresh data → update local cache
      console.log("[CoursesClient] DATA → updating local cache", {
        items: result.courses.length,
        version: result.version,
      });

      chatCache.set(
        "all_courses",
        result.courses,
        safeUserId,
        result.version
      );

      return result.courses;
    },
    // Initial fast render from local cache (if available)
    initialData: () => {
      const cached = chatCache.get<Course[]>("all_courses", safeUserId);
      console.log("[CoursesClient] initialData from cache:", {
        hasCache: !!cached,
        items: cached?.data?.length ?? 0,
      });
      return cached?.data;
    },
    staleTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: true,
  });
  console.log("[CoursesClient] render", {
    isLoading,
    courseCount: courses.length,
  });
  // Loading state
  if (!mounted || isLoading) {
    console.log("[CoursesClient] loading skeleton");
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
        {Array.from({ length: 9 }).map((_, i) => (
          <PublicCourseCardSkeleton key={i} />
        ))}
      </div>
    );
  }
  // Empty state
  if (courses.length === 0) {
    console.log("[CoursesClient] empty state");
    return (
      <div className="flex flex-col items-center justify-center p-12 rounded-3xl border border-dashed border-border/20 bg-muted/5">
        <p className="text-muted-foreground font-medium italic">
          No courses found.
        </p>
      </div>
    );
  }
  // Render courses
  console.log("[CoursesClient] rendering courses");
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
      {courses.map((course) => (
        <PublicCourseCard
          key={course.id}
          data={course}
          enrollmentStatus={course.enrollmentStatus}
        />
      ))}
    </div>
  );
}
