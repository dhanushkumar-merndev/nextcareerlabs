"use client";

import { useEffect, useState } from "react";

import { CourseSidebar } from "./CourseSidebar";

import { CourseSidebarDataType } from "@/app/data/course/get-course-sidebar-data";
import { usePathname } from "next/navigation";
import { useCourseProgressContext } from "@/providers/CourseProgressProvider";
import { useCourseProgress } from "@/hooks/use-course-progress";

export function SidebarContainer({
  course,
  children,
}: {
  course: CourseSidebarDataType["course"];
  children: React.ReactNode;
}) {
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
        <div className="hidden md:block w-80  border-r border-border shrink-0 bg-background/50 backdrop-blur-sm overflow-y-auto">
          <CourseSidebar course={course} />
        </div>

        {/* PAGE CONTENT (Video/Lesson) */}
        <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 bg-background">
          <div className="max-w-screen-7xl mx-auto w-full">
            {children}
          </div>
          
          {/* MOBILE PLAYLIST (Visible only on mobile, below content) */}
          <div className="md:hidden border-t border-border mt-6  pb-12">
           
            <CourseSidebar course={course} />
          </div>
        </div>
      </div>
    </div>
  );
}
