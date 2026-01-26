"use client";

import { useEffect, useState } from "react";

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
}: {
  slug: string;
  children: React.ReactNode;
  userId: string;
}) {
  const { data: course, isLoading } = useQuery({
    queryKey: ["course_sidebar", slug],
    queryFn: async () => {
      const cacheKey = `course_sidebar_${slug}`;
      const cached = chatCache.get<any>(cacheKey, userId);
      const clientVersion = cached?.version;

      console.log(`[Sidebar] Syncing for ${slug}...`);
      const result = await getCourseSidebarData(slug, clientVersion);

      if (result && (result as any).status === "not-modified" && cached) {
        return cached.data.course;
      }

      if (result && !(result as any).status) {
        chatCache.set(cacheKey, result, userId, (result as any).version);
        return (result as any).course;
      }
      return (result as any)?.course;
    },
    initialData: () => {
        const cacheKey = `course_sidebar_${slug}`;
        const cached = chatCache.get<any>(cacheKey, userId);
        return cached?.data?.course;
    },
    staleTime: 1800000, // 30 mins
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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* MAIN CONTENT AREA */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0">
        {/* DESKTOP SIDEBAR */}
       <div className="hidden md:block w-80 border-r border-border shrink-0 bg-background/50 backdrop-blur-sm h-[calc(100vh-7.1rem)] min-h-0">
          {isLoading && !course ? (
            <div className="p-4 space-y-4">
              <div className="h-8 bg-muted animate-pulse rounded" />
              <div className="space-y-2">
                {[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}
              </div>
            </div>
          ) : (
            course && <CourseSidebar course={course} />
          )}
        </div>

        {/* PAGE CONTENT (Video/Lesson) */}
        <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 bg-background">
          <div className="max-w-screen-7xl mx-auto w-full">
            {children}
          </div>
          
          {/* MOBILE PLAYLIST (Visible only on mobile, below content) */}
          <div className="md:hidden border-t border-border mt-4  pb-12">
            {!course ? (
               <div className="p-4 space-y-2">
                 {[1,2,3].map(i => <div key={i} className="h-12 bg-muted animate-pulse rounded" />)}
               </div>
            ) : (
              <CourseSidebar course={course} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
