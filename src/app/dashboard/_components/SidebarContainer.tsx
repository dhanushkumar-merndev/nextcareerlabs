"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { CourseSidebar } from "./CourseSidebar";
import { usePathname } from "next/navigation";
import { useCourseProgressContext } from "@/providers/CourseProgressProvider";
import { useCourseProgress } from "@/hooks/use-course-progress";
import { useQuery } from "@tanstack/react-query";
import {
  getCourseSidebarData,
  CourseSidebarDataType,
} from "@/app/data/course/get-course-sidebar-data";
import { chatCache } from "@/lib/chat-cache";

export function SidebarContainer({
  slug,
  children,
  userId,
  initialCourseData,
  initialVersion,
}: {
  slug: string;
  children: React.ReactNode;
  userId: string;
  initialCourseData?: CourseSidebarDataType["course"] | null;
  initialVersion?: string | null;
}) {

  /* ---------------- Cache Hydration ---------------- */
  useEffect(() => {
    if (initialCourseData && initialVersion) {
      const cacheKey = `course_sidebar_${slug}`;
      const cached = chatCache.get<any>(cacheKey, userId);

      if (!cached || cached.version !== initialVersion) {
        chatCache.set(
          cacheKey,
          { course: initialCourseData },
          userId,
          initialVersion
        );
      }
    }
  }, [slug, userId, initialCourseData, initialVersion]);

  /* ---------------- Query ---------------- */
  const { data: course, isLoading, isError } = useQuery({
    queryKey: ["course_sidebar", slug],
    queryFn: async () => {
      const cacheKey = `course_sidebar_${slug}`;
      const cached = chatCache.get<any>(cacheKey, userId);

      if (cached) {
        const cacheAge = Date.now() - (cached.timestamp ?? 0);
        if (cacheAge < 30 * 60 * 1000) {
          return cached.data.course;
        }
      }

      const clientVersion = cached?.version;
      const result = await getCourseSidebarData(
        slug,
        clientVersion
      ) as any;

      if (result?.status === "not-modified" && cached) {
        chatCache.touch(cacheKey, userId);
        return cached.data.course;
      }

      if (result?.course) {
        chatCache.set(cacheKey, result, userId, result.version);
        return result.course;
      }

      return cached?.data?.course ?? null;
    },
    staleTime: 1800000,
    retry: 1,
  });

  /* ---------------- Local State ---------------- */
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const {
    setProgressPercentage,
    setShowProgress,
    setCourseTitle,
  } = useCourseProgressContext();

  const { progressPercentage } = useCourseProgress({
    courseData: course,
  });

  /* ---------------- Effects ---------------- */

  useEffect(() => {
    if (!course) return;

    setProgressPercentage(progressPercentage);
    setCourseTitle(course.title);
    setShowProgress(true);

    return () => {
      setShowProgress(false);
      setCourseTitle("");
    };
  }, [
    progressPercentage,
    course,
    setProgressPercentage,
    setShowProgress,
    setCourseTitle,
  ]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

    if (isMobile && open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const showSkeleton = !course && !isError;

  /* ---------------- Render ---------------- */

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0">

        {/* DESKTOP SIDEBAR */}
        <div className="hidden md:block w-80 shrink-0 bg-background/50 backdrop-blur-sm h-[calc(100vh-7.1rem)] min-h-0">

          {showSkeleton && (
            <div className="absolute inset-0 z-10 p-4 space-y-6 bg-background">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          )}

          {course && <CourseSidebar course={course} />}
        </div>

        {/* PAGE CONTENT */}
        <div className="flex-1 overflow-y-auto min-h-0 bg-background">
          <div className="max-w-screen-7xl mx-auto w-full">
            {children}
          </div>

          {/* MOBILE SIDEBAR */}
          <div className="md:hidden border-t border-border pb-12 relative">

            {showSkeleton && (
              <div className="absolute inset-0 z-10 p-4 space-y-4 bg-background">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            )}

            {course && <CourseSidebar course={course} />}
          </div>
        </div>
      </div>
    </div>
  );
}