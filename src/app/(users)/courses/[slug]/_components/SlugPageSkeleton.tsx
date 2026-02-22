"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export function SlugPageSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 mt-5 px-4 lg:px-6">
      {/* Main Content Area */}
      <div className="order-1 lg:col-span-2">
        {/* Course Image Skeleton */}
        <Skeleton className="relative aspect-video w-full overflow-hidden rounded-xl shadow-lg" />

        {/* Course Details Skeleton */}
        <div className="mt-8 space-y-6">
          <div className="space-y-4">
            <Skeleton className="h-10 w-3/4 md:h-12" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-5/6" />
            </div>
          </div>

          {/* Badges Skeleton */}
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-7 w-24 rounded-full" />
            <Skeleton className="h-7 w-28 rounded-full" />
          </div>
        </div>

        <Separator className="my-8" />

        {/* Description Skeleton */}
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>

        <Separator className="mt-8 mb-6" />

        {/* Content Skeleton */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-5 w-32" />
          </div>

          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-0 overflow-hidden border-2 gap-0">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Skeleton className="size-10 rounded-full" />
                      <div className="space-y-2">
                        <Skeleton className="h-5 w-48" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                    </div>
                    <Skeleton className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Sidebar Skeleton */}
      <div className="order-2 lg:col-span-1">
        <div className="sticky top-20 h-fit space-y-4">
          <Card className="py-0 shadow-lg border border-border/50 rounded-xl">
            <CardContent className="p-6 space-y-8">
              {/* Benefits card skeleton */}
              <div className="rounded-xl bg-muted/40 p-5 border border-border/40 space-y-5">
                <Skeleton className="h-5 w-32" />
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <Skeleton className="size-9 rounded-full" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                      <Skeleton className="h-4 w-24" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Includes skeleton */}
              <div className="space-y-4">
                <Skeleton className="h-5 w-40" />
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="size-6 rounded-full" />
                      <Skeleton className="h-4 flex-1" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Button skeleton */}
              <div className="space-y-3">
                <Skeleton className="h-11 w-full rounded-md" />
                <Skeleton className="h-11 w-full rounded-md" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
