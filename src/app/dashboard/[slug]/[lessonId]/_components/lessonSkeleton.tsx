import { Skeleton } from "@/components/ui/skeleton";
import Loader from "@/components/ui/Loader";

export function LessonContentSkeleton() {
  return (
    <div className="flex flex-col h-full bg-background md:pl-6">
      <div className="w-full aspect-video relative md:rounded-lg rounded-none overflow-hidden bg-accent/50 border md:border-border border-transparent">
        <Skeleton className="w-full h-full" />
        <div className="absolute inset-0 flex items-center justify-center">
            <Loader size={32} />
        </div>
      </div>

      {/* Button Skeleton */}
      <div className="py-4 border-b">
        <Skeleton className="h-10 w-40 rounded-md" />
      </div>

      {/* Text Content */}
      <div className="space-y-4 pt-4 pb-10">
        {/* Title */}
        <Skeleton className="h-7 w-2/3 rounded" />

        {/* Paragraph lines */}
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="h-4 w-5/6 rounded" />
        <Skeleton className="h-4 w-4/6 rounded" />

        {/* Another block for long descriptions */}
        <div className="space-y-2 mt-4">
          <Skeleton className="h-4 w-5/6 rounded" />
          <Skeleton className="h-4 w-4/6 rounded" />
          <Skeleton className="h-4 w-3/6 rounded" />
        </div>
      </div>
    </div>
  );
}
