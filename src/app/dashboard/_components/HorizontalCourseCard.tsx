"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { constructUrl } from "@/hooks/use-construct-url";
import { Play } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { secureStorage } from "@/lib/secure-storage";
import { chatCache } from "@/lib/chat-cache";
import { useSmartSession } from "@/hooks/use-smart-session";

interface HorizontalCourseCardProps {
  course: {
    id: string;
    title: string;
    imageUrl: string;
    progress: number;
    totalLessons: number;
    completedLessons: number;
    slug: string;
    level: string;
    firstLessonId?: string | null;
    lessonsProgress?: Array<{
      id: string;
      duration: number;
      restrictionTime: number;
      completed: boolean;
    }>;
  };
  index?: number;
}

export function HorizontalCourseCard({
  course,
  index,
}: HorizontalCourseCardProps) {
  const { session } = useSmartSession();
  const userId = session?.user.id;

  const [liveProgress, setLiveProgress] = useState(course.progress);
  const [liveCompletedCount, setLiveCompletedCount] = useState(
    course.completedLessons,
  );

  useEffect(() => {
    if (!course.lessonsProgress) return;

    const calculateLiveProgress = () => {
      let totalCourseDuration = 0;
      let totalWatchedTime = 0;
      let completedCount = 0;

      course.lessonsProgress?.forEach((lp) => {
        // 1. Get Duration (chatCache (1-day) > secureStorage > DB)
        const cachedDuration = chatCache.get<number>(
          `duration_${lp.id}`,
          userId,
        )?.data;
        const localDuration = parseFloat(
          secureStorage.getItem(`duration-${lp.id}_${userId}`) || "0",
        );
        // DB duration is in minutes, Video duration is in seconds. Normalize to seconds.
        const duration = lp.duration || cachedDuration || localDuration || 0;
        totalCourseDuration += duration;

        // 2. Get Restriction / Watched Time (high-water-mark sources only)
        const cachedRestriction = chatCache.get<number>(
          `restriction_${lp.id}`,
          userId,
        )?.data;
        const localRestriction = parseFloat(
          secureStorage.getItem(`restriction-time-${lp.id}_${userId}`) || "0",
        );

        const effectiveRestriction = Math.max(
          lp.restrictionTime,
          cachedRestriction || 0,
          localRestriction,
        );

        // 3. Simple completion check (if restriction >= duration * 0.9 or lp.completed)
        // This makes it feel "live" if they just finished a video
        const isLocallyCompleted =
          lp.completed ||
          (duration > 0 && effectiveRestriction >= duration * 0.9);

        if (isLocallyCompleted) {
          completedCount++;
          totalWatchedTime += duration; // Count full duration for completed
        } else {
          totalWatchedTime += Math.min(effectiveRestriction, duration);
        }
      });

      // Prefer granular progress if we have durations, otherwise fallback to discrete
      if (totalCourseDuration > 0) {
        const granular = Math.round(
          (totalWatchedTime / totalCourseDuration) * 100,
        );
        // Ensure we don't go backwards from DB state
        setLiveProgress(Math.max(course.progress, granular));
      } else {
        // Fallback to discrete progress if no durations are available yet
        const discrete = Math.round(
          (completedCount / course.totalLessons) * 100,
        );
        setLiveProgress(Math.max(course.progress, discrete));
      }

      setLiveCompletedCount(Math.max(course.completedLessons, completedCount));
    };

    calculateLiveProgress();

    // Optional: Refresh periodically if they are watching in another tab
    const interval = setInterval(calculateLiveProgress, 5000);
    return () => clearInterval(interval);
  }, [course, userId]);

  const isCompleted = liveProgress === 100;
  const thumbnailUrl = constructUrl(course.imageUrl);

  return (
    <div className="group relative flex flex-col md:flex-row md:items-center gap-8 p-4 px-6 rounded-2xl border border-border/40 bg-card/40 backdrop-blur-sm transition-all duration-300 hover:bg-card/60 hover:border-primary/20">
      {/* Thumbnail */}
      <div className="relative w-full md:w-32 aspect-video rounded-xl overflow-hidden shrink-0 border border-border/20 shadow-md">
        <img
          src={thumbnailUrl}
          alt={course.title}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          crossOrigin="anonymous"
        />
        <div className="absolute top-1 right-1">
          <Badge className="bg-background/90 backdrop-blur-sm text-[8px] font-black uppercase text-foreground border-border/20 px-1.5 py-0">
            {isCompleted ? "Completed" : "Active"}
          </Badge>
        </div>
      </div>

      {/* Content info */}
      <div className="flex-1 flex flex-col gap-4">
        <div className="flex justify-between items-start gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-xl font-bold tracking-tight text-foreground uppercase group-hover:text-primary transition-colors truncate">
              {course.title}
            </h3>
            <p className="text-sm font-medium text-muted-foreground/60">
              {liveCompletedCount} of {course.totalLessons} lessons completed
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xl font-black text-primary/80 italic tabular-nums">
              {liveProgress}%
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Progress
            value={liveProgress}
            className="h-2 bg-primary/10 shadow-[inner_0_1px_2px_rgba(0,0,0,0.1)]"
          />
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-[0.2em]">
              {course.level}
            </span>
            <span className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-[0.2em]">
              Mastery
            </span>
          </div>
        </div>
      </div>

      {/* Action */}
      <div className="shrink-0 flex md:flex-col justify-end">
        <Button
          asChild
          size="sm"
          className="rounded-full px-8 font-bold uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20 h-10 w-full md:w-auto"
        >
          <Link
            href={
              course.firstLessonId
                ? `/dashboard/${course.slug}/${course.firstLessonId}`
                : `/dashboard/${course.slug}`
            }
          >
            <Play className="size-3 mr-2 fill-current" />
            {liveProgress > 0 ? (isCompleted ? "Review" : "Resume") : "Start"}
          </Link>
        </Button>
      </div>
    </div>
  );
}
