"use client";

import { cn } from "@/lib/utils";
import { Play, Check } from "lucide-react";
import Link from "next/link";

interface iAppProps {
  lesson: {
    id: string;
    title: string;
    position: number;
    description: string | null;
  };
  slug: string;
  isActive?: boolean;
  completed: boolean;
}

export function LessonItem({ lesson, slug, isActive, completed }: iAppProps) {
  return (
    <Link
      href={`/dashboard/${slug}/${lesson.id}`}
      className={cn(
        "w-full p-3 h-auto flex items-center justify-start rounded-xl transition-all border group",

        // Normal
        !completed &&
          !isActive &&
          "bg-card text-foreground hover:bg-accent hover:text-accent-foreground",

        // Active (not completed)
        isActive &&
          !completed &&
          "bg-primary/10 border-primary shadow-md ring-1 ring-primary/30",

        // Completed (dimmed)
        completed &&
          !isActive &&
          "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-900 dark:text-green-200 opacity-70",

        // Active + Completed (bright)
        completed &&
          isActive &&
          "opacity-100 bg-green-100 dark:bg-green-900/40 border-green-600 ring-2 ring-green-500/40 shadow-md"
      )}
    >
      <div className="flex items-center gap-3 w-full min-w-0">
        {/* ICON */}
        <div className="shrink-0">
          <div
            className={cn(
              "size-6 rounded-full flex justify-center items-center transition-all",

              !completed &&
                "border border-primary/40 bg-background text-primary/60",

              completed &&
                !isActive &&
                "border-green-500 bg-green-100 dark:bg-green-900/40 text-green-700/70 dark:text-green-300/70",

              completed &&
                isActive &&
                "border-green-700 bg-green-200 dark:bg-green-900/60 text-green-800 dark:text-green-300 shadow"
            )}
          >
            {completed ? (
              <Check className="size-3" />
            ) : (
              <Play className="size-3" />
            )}
          </div>
        </div>

        {/* TEXT */}
        <div className="flex flex-col min-w-0">
          <p
            className={cn(
              "text-sm font-medium truncate",

              completed &&
                !isActive &&
                "text-green-700 dark:text-green-200 opacity-70",

              completed &&
                isActive &&
                "text-green-700 dark:text-green-300 font-semibold opacity-100",

              isActive && !completed && "text-primary font-semibold"
            )}
          >
            {lesson.position}. {lesson.title}
          </p>

          {/* ⭐ CURRENTLY WATCHING TAG */}
          {!completed && isActive && (
            <p className="text-xs text-primary font-medium mt-0.5">
              Currently watching
            </p>
          )}

          {/* Completed Label */}
          {completed && (
            <span
              className={cn(
                "text-xs mt-0.5",
                !isActive && "text-green-600/70 dark:text-green-300/70",
                isActive && "text-green-600 dark:text-green-300"
              )}
            >
              Completed
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
