"use client";

import { CourseSidebarDataType } from "@/app/data/course/get-course-sidebar-data";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import { ChevronDown, ListVideo } from "lucide-react";
import { LessonItem } from "./LessonItem";
import { usePathname } from "next/navigation";
import { CourseProgressBar } from "./CourseProgressBar";
import { CircularProgress } from "@/components/ui/circular-progress";
import { useEffect, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { secureStorage } from "@/lib/secure-storage";
import { chatCache } from "@/lib/chat-cache";
import { useSmartSession } from "@/hooks/use-smart-session";

interface iAppProps {
  course: CourseSidebarDataType["course"];
}

export function CourseSidebar({ course }: iAppProps) {
  const { session } = useSmartSession();
  const userId = session?.user.id;

  const pathname = usePathname();
  const currentLessonId = pathname.split("/").pop();

  const [openChapter, setOpenChapter] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [chapterProgressMap, setChapterProgressMap] = useState<
    Record<string, number>
  >({});

  const calculateChapterProgress = useCallback(() => {
    if (!course?.chapter) return;

    const newMap: Record<string, number> = {};

    course.chapter.forEach((chapter: any) => {
      const total = chapter.lesson.length;
      if (total === 0) {
        newMap[chapter.id] = 0;
        return;
      }

      let totalChapterDuration = 0;
      let totalChapterWatched = 0;
      let completedCount = 0;

      chapter.lesson.forEach((lesson: any) => {
        // 1. Get Duration (chatCache (1-day) > secureStorage > DB)
        const cachedDuration = chatCache.get<number>(
          `duration_${lesson.id}`,
          userId,
        )?.data;
        const localDuration = parseFloat(
          secureStorage.getItem(`duration-${lesson.id}`) || "0",
        );
        const duration =
          cachedDuration ||
          localDuration ||
          (lesson.duration ? lesson.duration * 60 : 0) ||
          0;
        totalChapterDuration += duration;

        // 2. Get Restriction / Watched Time
        const cachedRestriction = chatCache.get<number>(
          `restriction_${lesson.id}`,
          userId,
        )?.data;
        const localRestriction = parseFloat(
          secureStorage.getItem(`restriction-time-${lesson.id}`) || "0",
        );
        const localProgress = parseFloat(
          secureStorage.getItem(`video-progress-${lesson.id}`) || "0",
        );

        const effectiveRestriction = Math.max(
          lesson.lessonProgress?.[0]?.restrictionTime || 0,
          cachedRestriction || 0,
          localRestriction,
          localProgress,
        );

        // 3. Completion check
        const isCompleted =
          lesson.lessonProgress?.some((p: any) => p.completed) ||
          (duration > 0 && effectiveRestriction >= duration * 0.95);

        if (isCompleted) {
          completedCount++;
          totalChapterWatched += duration;
        } else {
          totalChapterWatched += Math.min(effectiveRestriction, duration);
        }
      });

      if (totalChapterDuration > 0) {
        newMap[chapter.id] = Math.round(
          (totalChapterWatched / totalChapterDuration) * 100,
        );
      } else {
        newMap[chapter.id] = Math.round((completedCount / total) * 100);
      }
    });

    setChapterProgressMap(newMap);
  }, [course, userId]);

  useEffect(() => {
    calculateChapterProgress();
    const interval = setInterval(calculateChapterProgress, 5000);
    return () => clearInterval(interval);
  }, [calculateChapterProgress]);

  // ✅ Fixed: derive lessonId inside effect, depend on pathname not currentLessonId
  useEffect(() => {
    if (!course?.chapter?.length) return;
    const lessonId = pathname.split("/").pop();
    const found =
      course.chapter.find((c: any) =>
        c.lesson.some((l: any) => l.id === lessonId),
      )?.id ||
      course.chapter[0]?.id ||
      null;
    setOpenChapter(found);
  }, [course, pathname]);

  const toggleChapter = (id: string) => {
    setOpenChapter((prev) => (prev === id ? null : id));
  };

  return (
    <div className="flex flex-col h-full">
      {/* HEADER (Desktop Only) */}
      <div className="hidden min-[1025px]:block">
        <CourseProgressBar course={course} />
      </div>

      {/* MOBILE ONLY */}
      <div className="min-[1025px]:hidden">
        <div className="flex items-center justify-between gap-4 pt-5 pb-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-lg truncate">
              {course.chapter.find((c: any) => c.id === openChapter)?.title ||
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
              <div
                className="grid gap-2 mt-4 max-h-[60vh] overflow-y-auto pr-2 no-scrollbar"
                data-lenis-prevent
              >
                {course.chapter.map((chapter: any) => {
                  return (
                    <Button
                      key={chapter.id}
                      variant={
                        openChapter === chapter.id ? "secondary" : "outline"
                      }
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
                        value={chapterProgressMap[chapter.id] || 0}
                        size={34}
                        showCircle={false}
                        strokeWidth={2.5}
                        progressClassName={
                          openChapter === chapter.id
                            ? "text-secondary-foreground"
                            : "text-primary"
                        }
                        bgClassName={
                          openChapter === chapter.id
                            ? "text-secondary-foreground/30"
                            : "text-muted-foreground/25"
                        }
                        textClassName={
                          openChapter === chapter.id
                            ? "text-secondary-foreground"
                            : "text-primary"
                        }
                      />
                    </Button>
                  );
                })}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-2 mt-4">
          {(() => {
            const activeChapter = course.chapter.find(
              (c: any) => c.id === openChapter,
            );
            return activeChapter?.lesson.map((lesson: any) => {
              const cachedDuration = chatCache.get<number>(
                `duration_${lesson.id}`,
                userId,
              )?.data;
              const localDuration = parseFloat(
                secureStorage.getItem(`duration-${lesson.id}`) || "0",
              );
              const duration =
                cachedDuration ||
                localDuration ||
                (lesson.duration ? lesson.duration * 60 : 0) ||
                0;
              const cachedRestriction = chatCache.get<number>(
                `restriction_${lesson.id}`,
                userId,
              )?.data;
              const localRestriction = parseFloat(
                secureStorage.getItem(`restriction-time-${lesson.id}`) || "0",
              );
              const localProgress = parseFloat(
                secureStorage.getItem(`video-progress-${lesson.id}`) || "0",
              );
              const effectiveRestriction = Math.max(
                lesson.lessonProgress?.[0]?.restrictionTime || 0,
                cachedRestriction || 0,
                localRestriction,
                localProgress,
              );
              const isCompleted =
                lesson.lessonProgress?.some((p: any) => p.completed) ||
                (duration > 0 && effectiveRestriction >= duration * 0.95);

              return (
                <LessonItem
                  key={lesson.id}
                  lesson={lesson}
                  slug={course.slug}
                  isActive={currentLessonId === lesson.id}
                  courseThumbnail={course.fileKey}
                  completed={isCompleted}
                />
              );
            });
          })()}
        </div>
      </div>

      {/* DESKTOP ONLY */}
      <div
        className="hidden min-[1025px]:block pt-4 pr-4 space-y-3 flex-1 overflow-y-auto min-h-0 no-scrollbar"
        data-lenis-prevent
      >
        {course.chapter.map((chapter: any) => {
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
                    className={`size-4 text-primary transition-transform ${isOpen ? "rotate-180" : ""}`}
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
                    value={chapterProgressMap[chapter.id] || 0}
                    size={30}
                    strokeWidth={2.5}
                    showCircle={false}
                  />
                </Button>
              </CollapsibleTrigger>

              <CollapsibleContent className="mt-3 pl-6 border-l-2 space-y-3">
                {chapter.lesson.map((lesson: any) => {
                  const cachedDuration = chatCache.get<number>(
                    `duration_${lesson.id}`,
                    userId,
                  )?.data;
                  const localDuration = parseFloat(
                    secureStorage.getItem(`duration-${lesson.id}`) || "0",
                  );
                  const duration =
                    cachedDuration ||
                    localDuration ||
                    (lesson.duration ? lesson.duration * 60 : 0) ||
                    0;
                  const cachedRestriction = chatCache.get<number>(
                    `restriction_${lesson.id}`,
                    userId,
                  )?.data;
                  const localRestriction = parseFloat(
                    secureStorage.getItem(`restriction-time-${lesson.id}`) ||
                      "0",
                  );
                  const localProgress = parseFloat(
                    secureStorage.getItem(`video-progress-${lesson.id}`) || "0",
                  );
                  const effectiveRestriction = Math.max(
                    lesson.lessonProgress?.[0]?.restrictionTime || 0,
                    cachedRestriction || 0,
                    localRestriction,
                    localProgress,
                  );
                  const isCompleted =
                    lesson.lessonProgress?.some((p: any) => p.completed) ||
                    (duration > 0 && effectiveRestriction >= duration * 0.95);

                  return (
                    <LessonItem
                      key={lesson.id}
                      lesson={lesson}
                      slug={course.slug}
                      isActive={currentLessonId === lesson.id}
                      courseThumbnail={course.fileKey}
                      completed={isCompleted}
                    />
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
