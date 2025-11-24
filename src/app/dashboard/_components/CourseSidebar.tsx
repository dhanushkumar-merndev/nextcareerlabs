"use client";

import { CourseSidebarDataType } from "@/app/data/course/get-course-sidebar-data";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { CollapsibleContent } from "@radix-ui/react-collapsible";
import { ChevronDown, Play } from "lucide-react";
import { LessonItem } from "./LessonItem";
import { usePathname } from "next/navigation";
import { useCourseProgress } from "@/hooks/use-course-progress";
import { useState } from "react";

interface iAppProps {
  course: CourseSidebarDataType["course"];
}

export function CourseSidebar({ course }: iAppProps) {
  const pathname = usePathname();
  const currentLessonId = pathname.split("/").pop();

  const { completedLessons, totalLessons, progressPercentage } =
    useCourseProgress({ courseData: course });

  // ⭐ Track which chapter is open
  const [openChapter, setOpenChapter] = useState<string | null>(
    course.chapter[0]?.id || null
  );

  function toggleChapter(id: string) {
    setOpenChapter((prev) => (prev === id ? null : id));
  }

  return (
    <div className="flex flex-col h-full">
      {/* TOP HEADER */}
      <div className="pb-4 pr-4 border-b border-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Play className="size-5 text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-base truncate">{course.title}</h1>
            <p className="text-sm text-muted-foreground mt-1 truncate">
              {course.category}
            </p>
          </div>
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span>Progress</span>
            <span>
              {completedLessons}/{totalLessons} Lessons
            </span>
          </div>
          <Progress value={progressPercentage} className="h-1.5" />
          <p className="text-xs text-muted-foreground">
            {progressPercentage}% completed
          </p>
        </div>
      </div>

      {/* CHAPTER LIST */}
      <div className="py-4 pr-4 space-y-3">
        {course.chapter.map((chapter) => {
          const isOpen = openChapter === chapter.id;

          return (
            <Collapsible key={chapter.id} open={isOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full p-3 h-auto flex items-center gap-2"
                  onClick={() => toggleChapter(chapter.id)}
                >
                  <ChevronDown
                    className={`size-4 text-primary transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />

                  <div className="flex-1 text-left min-w-0">
                    <p className="text-semibold text-sm truncate text-foreground">
                      {chapter.position}: {chapter.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-medium truncate">
                      {chapter.lesson.length} lessons
                    </p>
                  </div>
                </Button>
              </CollapsibleTrigger>

              <CollapsibleContent className="mt-3 pl-6 border-l-2 space-y-3">
                {chapter.lesson.map((lesson) => (
                  <LessonItem
                    key={lesson.id}
                    lesson={lesson}
                    slug={course.slug}
                    isActive={currentLessonId === lesson.id}
                    completed={
                      lesson.lessonProgress.some((p) => p.completed) || false
                    }
                  />
                ))}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
