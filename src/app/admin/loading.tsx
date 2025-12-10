import { Skeleton } from "@/components/ui/skeleton";
import { AdminCourseCardSkeleton } from "./courses/_components/AdminCourseCard";

export default function Loading() {
  return (
    <div className="space-y-10 px-4 lg:px-6 py-10">
      {/* Stats Card Skeletons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="border rounded-xl p-6 space-y-4">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>

      {/* Chart Skeleton */}
      <div className="rounded-xl border p-6">
        <Skeleton className="h-72 w-full" />
      </div>

      {/* Recent Courses Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Recent Courses Skeleton Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <AdminCourseCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
