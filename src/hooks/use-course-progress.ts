"use client";
import { CourseSidebarDataType } from "@/app/data/course/get-course-sidebar-data";
import { useMemo } from "react";

interface iAppProps {
  courseData: CourseSidebarDataType["course"];
}

interface CourseProgressResult {
  totalLessons: number;
  completedLessons: number;
  progressPercentage: number;
}

export function useCourseProgress({
  courseData,
}: {
  courseData?: CourseSidebarDataType["course"] | null;
}): CourseProgressResult {
  return useMemo(() => {
    let totalLessons = 0;
    let completedLessons = 0;

    if (!courseData?.chapter) {
      return {
        totalLessons: 0,
        completedLessons: 0,
        progressPercentage: 0,
      };
    }

    courseData.chapter.forEach((chapter: any) => {
      chapter.lesson.forEach((lesson: any) => {
        totalLessons++;

        const isCompleted = lesson.lessonProgress.some(
          (p: any) => p.completed
        );

        if (isCompleted) completedLessons++;
      });
    });

    const progressPercentage =
      totalLessons > 0
        ? Math.round((completedLessons / totalLessons) * 100)
        : 0;

    return {
      totalLessons,
      completedLessons,
      progressPercentage,
    };
  }, [courseData]);
}
