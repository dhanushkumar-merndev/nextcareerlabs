import { CourseSidebarDataType } from "@/app/data/course/get-course-sidebar-data";
import { useEffect, useState } from "react";
import { secureStorage } from "@/lib/secure-storage";
import { chatCache } from "@/lib/chat-cache";
import { useSmartSession } from "./use-smart-session";

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
  const { session } = useSmartSession();
  const userId = session?.user.id;

  const [liveData, setLiveData] = useState<CourseProgressResult>({
    totalLessons: 0,
    completedLessons: 0,
    progressPercentage: 0,
  });

  useEffect(() => {
    if (!courseData?.chapter) return;

    const calculate = () => {
      let totalLessons = 0;
      let completedLessons = 0;
      let totalCourseDuration = 0;
      let totalWatchedTime = 0;

      courseData.chapter.forEach((chapter: any) => {
        chapter.lesson?.forEach((lesson: any) => {
          totalLessons++;

          // 1. Get Duration: DB is the primary source (stable across sessions)
          // chatCache/secureStorage are only used when DB has no value
          const dbDuration = lesson.duration || 0;
          const cachedDuration = chatCache.get<number>(
            `duration_${lesson.id}`,
            userId,
          )?.data;
          const localDuration = parseFloat(
            secureStorage.getItem(`duration-${lesson.id}_${userId}`) || "0",
          );
          const duration = dbDuration || cachedDuration || localDuration || 0;
          totalCourseDuration += duration;

          // 2. Get Restriction / Watched Time (chatCache (1-day) > secureStorage > DB)
          // NOTE: Only use high-water-mark sources (restrictionTime, restriction-time-{id})
          // Do NOT use video-progress-{id} — that's the current playback position,
          // not max watched, and changes on every navigation causing progress flicker.
          const cachedRestriction = chatCache.get<number>(
            `restriction_${lesson.id}`,
            userId,
          )?.data;
          const localRestriction = parseFloat(
            secureStorage.getItem(`restriction-time-${lesson.id}_${userId}`) || "0",
          );

          const effectiveRestriction = Math.max(
            lesson.lessonProgress?.[0]?.restrictionTime || 0,
            cachedRestriction || 0,
            localRestriction,
          );

          // 3. Completion Check
          const isCompleted =
            lesson.lessonProgress?.some((p: any) => p.completed) ||
            (duration > 0 && effectiveRestriction >= duration * 0.9);

          if (isCompleted) {
            completedLessons++;
            totalWatchedTime += duration;
          } else {
            totalWatchedTime += Math.min(effectiveRestriction, duration);
          }
        });
      });

      const progressPercentage =
        totalCourseDuration > 0
          ? Math.round((totalWatchedTime / totalCourseDuration) * 100)
          : totalLessons > 0
            ? Math.round((completedLessons / totalLessons) * 100)
            : 0;

      setLiveData({
        totalLessons,
        completedLessons,
        progressPercentage,
      });
    };

    calculate();
    const interval = setInterval(calculate, 5000);
    return () => clearInterval(interval);
  }, [courseData, userId]);

  return liveData;
}
