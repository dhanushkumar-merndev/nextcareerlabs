import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="px-4 lg:px-6 pb-10 space-y-6">
      {/* Title + Subtitle */}
      <div className="space-y-2">
        <Skeleton className="h-9 w-48 rounded-lg" />
        <Skeleton className="h-4 w-64 rounded-md" />
      </div>

      {/* Grid of course card skeletons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border border-border/50 rounded-xl overflow-hidden bg-card/50 shadow-sm animate-pulse">
            {/* Thumbnail Placeholder */}
            <div className="relative aspect-video w-full bg-muted/40">
               <div className="absolute top-2 right-2">
                  <Skeleton className="h-5 w-16 bg-muted/60 rounded-md" />
               </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Title */}
              <Skeleton className="h-6 w-3/4 rounded-md" />

              {/* Description */}
              <div className="space-y-2">
                <Skeleton className="h-3 w-full rounded-full" />
                <Skeleton className="h-3 w-5/6 rounded-full" />
              </div>

              {/* Progress Section */}
              <div className="space-y-2 mt-4">
                <div className="flex justify-between items-center">
                   <Skeleton className="h-3 w-20 rounded-full" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
                <Skeleton className="h-2 w-24 rounded-full" />
              </div>

              {/* Buttons */}
              <div className="flex gap-2 pt-2">
                <Skeleton className="h-10 w-1/2 rounded-lg" />
                <Skeleton className="h-10 w-1/2 rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
