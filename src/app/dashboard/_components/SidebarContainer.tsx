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

type SidebarCourse = Extract<
  CourseSidebarDataType,
  { course: NonNullable<any> }
>["course"];
type SidebarCacheData = { course: SidebarCourse };
// chatCache.get returns: { data: SidebarCacheData, version?: string, timestamp?: number } | null

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
  initialCourseData?: SidebarCourse | null;
  initialVersion?: string | null;
}) {
  /* ---------------- Cache Hydration ---------------- */
  useEffect(() => {
    if (initialCourseData && initialVersion) {
      const cacheKey = `course_sidebar_${slug}`;
      const cached = chatCache.get<SidebarCacheData>(cacheKey, userId);
      if (!cached || cached.version !== initialVersion) {
        chatCache.set<SidebarCacheData>(
          cacheKey,
          { course: initialCourseData },
          userId,
          initialVersion,
        );
      }
    }
  }, [slug, userId, initialCourseData, initialVersion]);

  /* ---------------- Query ---------------- */
  const { data: course, isError } = useQuery<SidebarCourse | null>({
    queryKey: ["course_sidebar", slug],
    queryFn: async () => {
      const cacheKey = `course_sidebar_${slug}`;
      const cached = chatCache.get<SidebarCacheData>(cacheKey, userId);
      const clientVersion = cached?.version; // ✅ read BEFORE early return

      // ✅ localStorage hit — return instantly
      if (cached) return cached.data.course;

      const result = await getCourseSidebarData(slug, clientVersion);

      // not-modified or error status
      if ("status" in result) {
        if (result.status === "not-modified") {
          const refetched = chatCache.get<SidebarCacheData>(cacheKey, userId);
          if (refetched) {
            chatCache.touch(cacheKey, userId);
            return refetched.data.course; // ✅ refetched.data = { course: SidebarCourse }
          }
        }
        return null;
      }

      // ✅ success branch — result has .course and .version
      chatCache.set<SidebarCacheData>(
        cacheKey,
        { course: result.course },
        userId,
        result.version,
      );
      return result.course;
    },
    staleTime: 1800000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  });

  /* ---------------- Local State ---------------- */
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const { setProgressPercentage, setShowProgress, setCourseTitle } =
    useCourseProgressContext();
  const { progressPercentage } = useCourseProgress({ courseData: course });

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
    const isMobileBreakpoint =
      typeof window !== "undefined" && window.innerWidth < 1025;
    if (isMobileBreakpoint && open) {
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
        <div className="hidden min-[1025px]:block w-80 shrink-0 bg-background/50 backdrop-blur-sm h-[calc(100vh-7.1rem)] min-h-0">
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
          <div className="max-w-screen-7xl mx-auto w-full">{children}</div>

          {/* MOBILE SIDEBAR */}
          <div className="min-[1025px]:hidden border-t border-border pb-12 relative">
            {showSkeleton && (
              <div className="absolute inset-0 z-10 py-4 space-y-4 bg-background">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            )}
            {course && <CourseSidebar course={course} />}
          </div>
        </div>
      </div>
    </div>
  );
}
