import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 mt-5 px-4 lg:px-6">
      {/* LEFT CONTENT */}
      <div className="order-1 lg:col-span-2 space-y-8">
        {/* Thumbnail / Hero */}
        <div className="relative w-full aspect-video rounded-xl overflow-hidden">
          <Skeleton className="w-full h-full" />
        </div>

        {/* Title + small description */}
        <div className="space-y-4">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </div>

        {/* Badges */}
        <div className="flex gap-3">
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>

        <Skeleton className="h-1 w-full" />

        {/* Course Description */}
        <div className="space-y-4">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
        </div>

        <Skeleton className="h-1 w-full" />

        {/* Course Content Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-6 w-40" />
          </div>

          {/* Chapter Skeletons */}
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="border rounded-xl overflow-hidden">
                <Skeleton className="h-20 w-full" />
                <div className="space-y-3 p-4 border-t">
                  {Array.from({ length: 2 }).map((_, j) => (
                    <Skeleton key={j} className="h-10 w-full rounded-md" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT SIDEBAR */}
      <div className="order-2 lg:col-span-1 sticky top-20 space-y-6">
        <div className="border rounded-xl p-6 space-y-8 shadow">
          {/* Price */}
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-8 w-28" />
          </div>

          {/* Benefits Box */}
          <div className="rounded-xl border p-5 space-y-4">
            <Skeleton className="h-5 w-40" />

            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>

          {/* This Course Includes */}
          <div className="space-y-3">
            <Skeleton className="h-5 w-48" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-4 w-40" />
              </div>
            ))}
          </div>

          {/* Buttons */}
          <div className="space-y-4">
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-3 w-40 mx-auto" />
          </div>
        </div>
      </div>
    </div>
  );
}
