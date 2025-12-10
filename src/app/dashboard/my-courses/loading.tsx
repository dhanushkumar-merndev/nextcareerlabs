import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="px-4 lg:px-6 pb-10 space-y-6">
      {/* Title + Subtitle */}
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-64" />

      {/* Grid of course card skeletons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border rounded-xl p-4 space-y-4">
            {/* Thumbnail */}
            <Skeleton className="h-40 w-full rounded" />

            {/* Title */}
            <Skeleton className="h-5 w-3/4" />

            {/* Subtitle */}
            <Skeleton className="h-4 w-1/2" />

            {/* Progress bar */}
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />

            {/* Button */}
            <Skeleton className="h-10 w-full rounded-lg mt-4" />
          </div>
        ))}
      </div>
    </div>
  );
}
