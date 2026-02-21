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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Sync initialData to local storage on mount to keep local cache fresh
    if (initialCourseData && initialVersion) {
        const cacheKey = `course_sidebar_${slug}`;
        const cached = chatCache.get<any>(cacheKey, userId);
        
        if (!cached || cached.version !== initialVersion) {
            console.log(`[Hydration] Syncing server sidebar data to local cache for ${slug}`);
            chatCache.set(cacheKey, { course: initialCourseData }, userId, initialVersion);
        }
    }
  }, [slug, userId, initialCourseData, initialVersion]);

  // StrictMode guard: ensure LOCAL HIT log fires exactly once per mount
  const localHitLoggedRef = useRef(false);

  // Pre-calculate initial data from chatCache to ensure number-based initialDataUpdatedAt
  const cachedSidebar = typeof window !== "undefined" ? chatCache.get<any>(`course_sidebar_${slug}`, userId) : null;
  const initialUpdatedAt = cachedSidebar?.timestamp ?? 0;

  const { data: course, isLoading } = useQuery({
    queryKey: ["course_sidebar", slug],
    queryFn: async () => {
      const cacheKey = `course_sidebar_${slug}`;
      const cached = chatCache.get<any>(cacheKey, userId);
      const clientVersion = cached?.version;

      const result = await getCourseSidebarData(slug, clientVersion);

      if (result && (result as any).status === "not-modified" && cached) {
        console.log("%c[■ Sidebar] 🟡 LOCAL HIT → version matched, NO server fetch", "color: #eab308; font-weight: bold");
        chatCache.touch(cacheKey, userId); // Refresh local TTL
        return cached.data.course;
      }

      if (result && !(result as any).status) {
        console.log("%c[■ Sidebar] 💡 NEW DATA → updating local cache", "color: #06b6d4");
        chatCache.set(cacheKey, result, userId, (result as any).version);
        return (result as any).course;
      }
      return (result as any)?.course;
    },
    initialData: () => {
      // ★ PRIORITY 1: Local Cache (instant render, no network)
      if (cachedSidebar) {
        if (!localHitLoggedRef.current) {
          localHitLoggedRef.current = true;
          console.log(
            `%c[■ Sidebar] 🟡 LOCAL HIT (v${cachedSidebar.version}) → instant render from localStorage`,
            "color: #eab308; font-weight: bold"
          );
        }
        return cachedSidebar.data.course;
      }
      // ★ PRIORITY 2: Server-provided SSR data (first-ever load, no local cache yet)
      if (initialCourseData) return initialCourseData;
      return undefined;
    },
    staleTime: 1800000, // 30 minutes — aligns with Redis TTL
    initialDataUpdatedAt: initialUpdatedAt,
  });

  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const { setProgressPercentage, setShowProgress, setCourseTitle } = useCourseProgressContext();
  const { progressPercentage } = useCourseProgress({ courseData: course });

  // Sync progress context
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

  // -------------------------------------------------
  // 🚫 FIX: Close sidebar when navigating to a new page
  // -------------------------------------------------
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // -------------------------------------------------
  // 🚫 Disable background scroll when sidebar is open (MOBILE ONLY)
  // -------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isMobile = window.innerWidth < 768;

    if (isMobile && open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Hydration fix: Always match server's first render (Skeleton if initialData is null)
  const isHydrated = mounted;
  const activeCourse = isHydrated ? course : initialCourseData;
  const showSkeleton = !isHydrated || (isLoading && !activeCourse);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* MAIN CONTENT AREA */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0">
        {/* DESKTOP SIDEBAR */}
       <div className="hidden md:block w-80 shrink-0 bg-background/50 backdrop-blur-sm h-[calc(100vh-7.1rem)] min-h-0">
          {showSkeleton ? (
            <div className="p-4 space-y-6">
              {/* ProgressBar Skeleton */}
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

              {/* Chapter/Lesson List Skeleton */}
              <div className="space-y-3 pt-4">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="flex flex-col gap-2">
                    <Skeleton className="h-12 w-full rounded-xl" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            activeCourse && <CourseSidebar course={activeCourse} />
          )}
        </div>

        {/* PAGE CONTENT (Video/Lesson) */}
        <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 bg-background">
          <div className="max-w-screen-7xl mx-auto w-full">
            {children}
          </div>
          
          {/* MOBILE PLAYLIST (Visible only on mobile, below content) */}
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
              activeCourse && <CourseSidebar course={activeCourse} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
