"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function LessonContentSkeleton() {
  return (
    <div className="flex flex-col h-full bg-background md:pl-6">
      {/* Video Skeleton */}
      <div className="w-full h-[210px] sm:h-[150px] md:aspect-video">
        <Skeleton className="w-full h-full md:rounded-lg rounded-none" />
      </div>

      {/* Button Skeleton */}
      <div className="py-4 border-b">
        <Skeleton className="h-10 w-40 rounded-md" />
      </div>

      {/* Text Content */}
      <div className="space-y-4 pt-4 pb-10">
        {/* Title */}
        <Skeleton className="h-7 w-2/3 rounded" />

        {/* Paragraph lines */}
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="h-4 w-5/6 rounded" />
        <Skeleton className="h-4 w-4/6 rounded" />

        {/* Another block for long descriptions */}
        <div className="space-y-2 mt-4">
          <Skeleton className="h-4 w-5/6 rounded" />
          <Skeleton className="h-4 w-4/6 rounded" />
          <Skeleton className="h-4 w-3/6 rounded" />
        </div>
      </div>
    </div>
  );
}
