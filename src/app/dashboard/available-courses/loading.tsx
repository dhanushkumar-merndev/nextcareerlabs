import { Skeleton } from "@/components/ui/skeleton";
import { PublicCourseCardSkeleton } from "../../(users)/_components/PublicCourseCard";

export default function Loading() {
  return (
    <div className="px-4 lg:px-6 pb-10 space-y-6">
      {/* Heading skeleton */}
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />

      {/* Course grid skeletons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <PublicCourseCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
