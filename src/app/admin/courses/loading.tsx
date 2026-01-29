import { Skeleton } from "@/components/ui/skeleton";
import { AdminCourseCardSkeleton } from "./_components/AdminCourseCard";

export default function Loading() {
 return (
    <div className="px-4 lg:px-6 lg:py-3 animate-pulse">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mt-3 mb-10 gap-4">
        <div className="flex flex-col space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>

        <div className="flex gap-3 w-full md:w-auto">
          <Skeleton className="h-10 w-full md:w-56 rounded-md" />
          <Skeleton className="h-10 w-40 rounded-md" />
        </div>
      </div>

      {/* Courses – 2 cards per row */}
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

