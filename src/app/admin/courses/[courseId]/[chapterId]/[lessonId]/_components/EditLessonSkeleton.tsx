"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function EditLessonSkeleton() {
  return (
    <div className="py-2.5 md:py-5 px-4 lg:px-6 animate-in fade-in duration-500">
      {/* Back Button Skeleton */}
      <Skeleton className="h-10 w-28 mb-6 rounded-md" />

      <Card>
        <CardHeader className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-80" />
        </CardHeader>
        <CardContent className="space-y-6 pt-0">
          <div className="space-y-6">
            {/* Lesson Name Field */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>

            {/* Description Field */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-32 w-full" />
            </div>

            {/* Thumbnail Field */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-40 w-full border-2 border-dashed rounded-lg" />
            </div>

            {/* Video Field */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-48 w-full border-2 border-dashed rounded-lg" />
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <Skeleton className="h-11 w-full rounded-md" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
