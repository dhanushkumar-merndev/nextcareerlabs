import { Skeleton } from "@/components/ui/skeleton";
import { PublicCourseCardSkeleton } from "../_components/PublicCourseCard";
export default function Loading() {
  return (
    <div className="mt-5 px-4 lg:px-6 space-y-10">
      {/* Header skeleton */}
      <div className="space-y-2">
      </div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
        <div className="flex flex-col space-y-2">
          <Skeleton className="h-8 w-56 md:w-72" />
          <Skeleton className="h-4 w-120" />
        </div>
        <Skeleton className="h-8 w-120" />
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
