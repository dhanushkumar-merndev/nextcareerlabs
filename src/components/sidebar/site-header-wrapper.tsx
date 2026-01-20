"use client";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "../ui/themeToggle";
import { CircularProgress } from "../ui/circular-progress";
import { useCourseProgressContext } from "@/providers/CourseProgressProvider";

export function SiteHeaderWrapper() {
  const { progressPercentage, showProgress, courseTitle } = useCourseProgressContext();

  return (
    <header className="flex h-[--header-height] shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-[--header-height]">
      <div className="flex w-full items-center gap-1 px-4 py-1.5 lg:gap-2 lg:px-6">
        {/* LEFT SIDE — Sidebar Trigger + Title */}
        <div className="flex items-center gap-1.5 lg:gap-2">

          <SidebarTrigger />
          <Separator
            orientation="vertical"
            className="mx-2 data-[orientation=vertical]:h-4"
          />
          <h1 className="text-base font-medium">{courseTitle || "Skillforce Cloud"}</h1>
        </div>

        {/* RIGHT SIDE — Theme Toggle */}
        <div className="ml-auto flex items-center gap-4">
                   {showProgress && (
            <div className="md:hidden flex items-center ml-1">
              <CircularProgress 
                value={progressPercentage} 
                size={38} 
                strokeWidth={3} 
              />
            </div>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
