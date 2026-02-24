"use client";

import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

import { CourseSidebar } from "./CourseSidebar";

import { usePathname } from "next/navigation";
import { useCourseProgressContext } from "@/providers/CourseProgressProvider";
import { useCourseProgress } from "@/hooks/use-course-progress";

import { useQuery } from "@tanstack/react-query";
import { getCourseSidebarData, CourseSidebarDataType } from "@/app/data/course/get-course-sidebar-data";
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
  // ✅ Remove mounted state entirely

  useEffect(() => {
    if (initialCourseData && initialVersion) {
      const cacheKey = `course_sidebar_${slug}`;
      const cached = chatCache.get<any>(cacheKey, userId);
      if (!cached || cached.version !== initialVersion) {
        chatCache.set(cacheKey, { course: initialCourseData }, userId, initialVersion);
      }
    }
  }, [slug, userId, initialCourseData, initialVersion]);


  const { data: course, isLoading } = useQuery({
    queryKey: ["course_sidebar", slug],
    queryFn: async () => {
  const cacheKey = `course_sidebar_${slug}`;
  const cached = chatCache.get<any>(cacheKey, userId);

  if (cached) {
    const cacheAge = Date.now() - (cached.timestamp ?? 0);
    const thirtyMins = 30 * 60 * 1000;

    // ✅ Under 30 mins — skip server entirely, no Redis calls at all
    if (cacheAge < thirtyMins) {
      console.log("[■ Sidebar] 🟡 LOCAL HIT → skipping server (under 30 min)");
      return cached.data.course;
    }
  }

  // Over 30 mins — do the version check
  const clientVersion = cached?.version;
  const result = await getCourseSidebarData(slug, clientVersion) as any;

  if (result?.status === "not-modified" && cached) {
    chatCache.touch(cacheKey, userId);
    return result.course;
  }

  if (result?.course) {
    chatCache.set(cacheKey, result, userId, result.version);
    return result.course;
  }

  return cached?.data?.course ?? null;
},
    staleTime: 1800000,
  });

  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { setProgressPercentage, setShowProgress, setCourseTitle } = useCourseProgressContext();
  const { progressPercentage } = useCourseProgress({ courseData: course });

  useEffect(() => {
    if (!course) return;
    setProgressPercentage(progressPercentage);
    setCourseTitle(course.title);
    setShowProgress(true);
    return () => {
      setShowProgress(false);
      setCourseTitle("");
    };
  }, [progressPercentage, course, setProgressPercentage, setShowProgress, setCourseTitle]);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isMobile = window.innerWidth < 768;
    if (isMobile && open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

const [isMounted, setIsMounted] = useState(false);
useEffect(() => { setIsMounted(true); }, []);

// ✅ Fix: only show skeleton after mount — prevents SSR/client mismatch
const showSkeleton = isMounted && isLoading && !course;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0">
        {/* DESKTOP SIDEBAR */}
        <div className="hidden md:block w-80 shrink-0 bg-background/50 backdrop-blur-sm h-[calc(100vh-7.1rem)] min-h-0">
          {showSkeleton ? (
            <div className="p-4 space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-10 rounded-lg" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-3 w-12" />
                    </div>
                  </div>
                  <Skeleton className="size-9 rounded-full" />
                </div>
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
              <div className="space-y-3 pt-4">
                {[1,2,3,4,5].map(i => (
                  <Skeleton key={i} className="h-12 w-full rounded-xl" />
                ))}
              </div>
            </div>
          ) : (
            course && <CourseSidebar course={course} />
          )}
        </div>

        {/* PAGE CONTENT */}
        <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 bg-background">
          <div className="max-w-screen-7xl mx-auto w-full">
            {children}
          </div>
          
          {/* MOBILE */}
          <div className="md:hidden border-t border-border pb-12">
            {showSkeleton ? (
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <Skeleton className="h-8 flex-1 rounded-lg" />
                  <Skeleton className="h-8 w-24 rounded-lg" />
                </div>
                <div className="space-y-3">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
                </div>
              </div>
            ) : (
              course && <CourseSidebar course={course} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}