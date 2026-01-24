"use client";

import { useEffect, useState } from "react";

import { CourseSidebar } from "./CourseSidebar";

import { CourseSidebarDataType } from "@/app/data/course/get-course-sidebar-data";
import { usePathname } from "next/navigation";
import { useCourseProgressContext } from "@/providers/CourseProgressProvider";
import { useCourseProgress } from "@/hooks/use-course-progress";

import { useQuery } from "@tanstack/react-query";
import { getCourseSidebarData } from "@/app/data/course/get-course-sidebar-data";
import { chatCache } from "@/lib/chat-cache";

export function SidebarContainer({
  course: initialCourse,
  children,
  userId,
}: {
  course: CourseSidebarDataType["course"];
  children: React.ReactNode;
  userId: string;
}) {
  const { data: courseData } = useQuery({
    queryKey: ["course_sidebar", initialCourse.slug],
    queryFn: async () => {
      const cacheKey = `course_sidebar_${initialCourse.slug}`;
      const cached = chatCache.get<any>(cacheKey, userId);
      const clientVersion = cached?.version;

      console.log(`[Sidebar] Syncing for ${initialCourse.slug}...`);
      const result = await getCourseSidebarData(initialCourse.slug, clientVersion);

      if (result && (result as any).status === "not-modified" && cached) {
        return cached.data.course;
      }

      if (result && !(result as any).status) {
        chatCache.set(cacheKey, result, userId, (result as any).version);
        return result.course;
      }
      return result?.course || initialCourse;
    },
    initialData: () => {
        const cacheKey = `course_sidebar_${initialCourse.slug}`;
        const cached = chatCache.get<any>(cacheKey, userId);
        return cached ? cached.data.course : initialCourse;
    },
    staleTime: 1800000, // 30 mins
  });

  const course = courseData || initialCourse;
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const { setProgressPercentage, setShowProgress, setCourseTitle } = useCourseProgressContext();
  const { progressPercentage } = useCourseProgress({ courseData: course });

  // Sync progress context
  useEffect(() => {
    setProgressPercentage(progressPercentage);
    setCourseTitle(course.title);
    setShowProgress(true);
    
    return () => {
      setShowProgress(false);
      setCourseTitle("");
    };
  }, [progressPercentage, course.title, setProgressPercentage, setShowProgress, setCourseTitle]);

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
          <CourseSidebar course={course} />
        </div>

        {/* PAGE CONTENT (Video/Lesson) */}
        <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 bg-background">
          <div className="max-w-screen-7xl mx-auto w-full">
            {children}
          </div>
          
          {/* MOBILE PLAYLIST (Visible only on mobile, below content) */}
          <div className="md:hidden border-t border-border mt-4  pb-12">
           
            <CourseSidebar course={course} />
          </div>
        </div>
      </div>
    </div>
  );
}
