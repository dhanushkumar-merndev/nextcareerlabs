"use client";

import { CourseSidebarDataType } from "@/app/data/course/get-course-sidebar-data";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleTrigger } from "@/components/ui/collapsible";

import { CollapsibleContent } from "@radix-ui/react-collapsible";
import { ChevronDown, Play } from "lucide-react";
import { LessonItem } from "./LessonItem";
import { usePathname } from "next/navigation";
import { CourseProgressBar } from "./CourseProgressBar";
import { CircularProgress } from "@/components/ui/circular-progress";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ListVideo } from "lucide-react";

interface iAppProps {
  course: CourseSidebarDataType["course"];
}

const getChapterProgress = (chapter: CourseSidebarDataType["course"]["chapter"][0]) => {
  const total = chapter.lesson.length;
  if (total === 0) return 0;
  const completed = chapter.lesson.filter((l:any) => 
    l.lessonProgress.some((p:any) => p.completed)
  ).length;
  return Math.round((completed / total) * 100);
};

export function CourseSidebar({ course }: iAppProps) {
  const pathname = usePathname();
  const currentLessonId = pathname.split("/").pop();

  const [openChapter, setOpenChapter] = useState<string | null>(
    course.chapter.find((c:any) => c.lesson.some((l:any) => l.id === currentLessonId))?.id ||
      course.chapter[0]?.id ||
      null
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const toggleChapter = (id: string) => {
    setOpenChapter((prev) => (prev === id ? null : id));
  };

  return (
    <div className="flex flex-col h-full">
      {/* HEADER (Desktop Only) */}
      <div className="hidden md:block">
        <CourseProgressBar course={course} />
      </div>

      {/* MOBILE ONLY: CHAPTER SELECTOR AND PLAYLIST */}
      <div className="md:hidden ">
        <div className="flex items-center justify-between gap-4 pt-5 pb-4 ">
          <div className="flex-1 min-w-0">
           
            <h3 className="font-bold text-lg truncate">
              {course.chapter.find((c:any) => c.id === openChapter)?.title ||
                "Select a Chapter"}
            </h3>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary" size="sm" className="gap-2 shrink-0">
                <ListVideo className="size-4" />
                Chapters
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[calc(100%-2rem)] rounded-xl">
              <DialogHeader>
                <DialogTitle>Select Chapter</DialogTitle>
              </DialogHeader>
              <div className="grid gap-2 mt-4 max-h-[60vh] overflow-y-auto pr-2 no-scrollbar" data-lenis-prevent >
                {course.chapter.map((chapter:any) => {
                  const chapterProgress = getChapterProgress(chapter);
                  return (
                    <Button
                      key={chapter.id}
                      variant={openChapter === chapter.id ? "secondary" : "outline"}
                      className="w-full justify-between h-auto p-3 text-left border border-transparent hover:border-border transition-all"
                      onClick={() => {
                        setOpenChapter(chapter.id);
                        setIsDialogOpen(false);
                      }}
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-0.5">
                          Chapter {chapter.position}
                        </span>
                        <span className="font-semibold text-sm truncate">
                          {chapter.title}
                        </span>
                      </div>
                      <CircularProgress 
                        value={chapterProgress} 
                        size={34} 
                        showCircle={false}
                        strokeWidth={2.5} 
                        progressClassName={openChapter === chapter.id ? "text-secondary-foreground" : "text-primary"}
                        bgClassName={openChapter === chapter.id ? "text-secondary-foreground/30" : "text-muted-foreground/25"}
                        textClassName={openChapter === chapter.id ? "text-secondary-foreground" : "text-primary"}
                      />
                    </Button>
                  );
                })}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Playlist Items */}
        <div className="space-y-2 mt-4">
          {course.chapter
            .find((c:any) => c.id === openChapter)
            ?.lesson.map((lesson:any) => (
              <LessonItem
                key={lesson.id}
                lesson={lesson}
                slug={course.slug}
                isActive={currentLessonId === lesson.id}
                completed={
                  lesson.lessonProgress.some((p:any) => p.completed) || false
                }
              />
            ))}
        </div>
      </div>

      {/* DESKTOP ONLY: COLLAPSIBLE CHAPTER LIST */}
<div className="hidden md:block pt-4 pr-4 space-y-3 flex-1 overflow-y-auto min-h-0  no-scrollbar" data-lenis-prevent
>
        {course.chapter.map((chapter:any) => {
          const isOpen = openChapter === chapter.id;
          const chapterProgress = getChapterProgress(chapter);

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

                  <div className="flex-1 pl-1 text-left min-w-0 pr-1">
                    <p className="font-semibold text-sm truncate text-foreground">
                      {chapter.position}: {chapter.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-medium truncate">
                      {chapter.lesson.length} lessons
                    </p>
                  </div>

                  <CircularProgress 
                    value={chapterProgress} 
                    size={30} 
                    strokeWidth={2.5} 
                   showCircle={false}
                  />
                </Button>
              </CollapsibleTrigger>

              <CollapsibleContent className="mt-3 pl-6 border-l-2 space-y-3">
                {chapter.lesson.map((lesson:any) => (
                  <LessonItem
                    key={lesson.id}
                    lesson={lesson}
                    slug={course.slug}
                    isActive={currentLessonId === lesson.id}
                    completed={
                      lesson.lessonProgress.some((p:any) => p.completed) || false
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
