import { AdminCourseCardSkeleton } from "./_components/AdminCourseCard";

export default function Loading() {
  return (
    <div className="px-4 py-3 lg:px-6 lg:py-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-10">
        <div className="h-7 w-40 bg-muted animate-pulse rounded" />
        <div className="h-10 w-32 bg-muted animate-pulse rounded" />
      </div>

      {/* Skeleton Grid */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3
        gap-7"
      >
        {Array.from({ length: 6 }).map((_, index) => (
          <AdminCourseCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}
