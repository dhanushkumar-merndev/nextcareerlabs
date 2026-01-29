import { Skeleton } from "@/components/ui/skeleton";
import { PublicCourseCardSkeleton } from "../_components/PublicCourseCard";
export default function Loading() {
  return (
     <div className="mt-5 px-4 lg:px-6 md:mb-40 animate-pulse">
      {/* Header + Search */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
        <div className="flex flex-col space-y-3">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>

        {/* Search input skeleton */}
        <Skeleton className="h-10 w-full md:w-64 rounded-md" />
      </div>

      {/* Course cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7">
        {Array.from({ length: 9 }).map((_, index) => (
          <PublicCourseCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}
