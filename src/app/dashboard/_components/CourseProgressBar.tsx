"use client";

import { CircularProgress } from "@/components/ui/circular-progress";
import { useCourseProgress } from "@/hooks/use-course-progress";
import { CourseSidebarDataType } from "@/app/data/course/get-course-sidebar-data";
import { Play } from "lucide-react";

export function CourseProgressBar({ course }: { course: CourseSidebarDataType["course"] }) {
  const { completedLessons, totalLessons, progressPercentage } = useCourseProgress({ courseData: course });

  return (
    <div className="pb-4 border-b border-border shrink-0">
      <div className="flex items-center justify-between gap-3 pr-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Play className="size-5 text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-base truncate">{course.title}</h1>
            <p className="text-sm text-muted-foreground truncate">
              {course.category}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {completedLessons}/{totalLessons} Lessons
            </p>
          </div>
        </div>

        <CircularProgress value={progressPercentage} size={42} strokeWidth={3} />
      </div>
    </div>
  );
}
