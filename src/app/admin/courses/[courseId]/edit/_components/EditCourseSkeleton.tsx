"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function EditCourseSkeleton() {
  return (
    <div className="px-4 lg:px-6 py-2 md:py-5 animate-in fade-in duration-500">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3 md:mb-6">
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-10 rounded-md" />
          <Skeleton className="h-9 w-32" />
        </div>
        <Skeleton className="h-9 w-64 sm:ml-2" />
      </div>

      {/* Tabs Skeleton */}
      <div className="w-full space-y-4">
        <div className="grid grid-cols-2 w-full h-10 bg-muted/20 rounded-md p-1 gap-1">
          <Skeleton className="h-full w-full" />
          <div className="h-full w-full" /> {/* Just one active-looking tab */}
        </div>

        <Card>
          <CardHeader className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-80" />
          </CardHeader>
          <CardContent className="space-y-8 p-4 md:p-6">
            {/* Form Fields Skeletons */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>

            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-32 w-full" />
            </div>

            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-40 w-full border-2 border-dashed rounded-lg" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Skeleton className="h-11 w-40 rounded-md" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
