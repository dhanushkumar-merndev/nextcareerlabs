import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col lg:flex-row gap-10 px-4 lg:px-6 py-10">
      {/* Main Content Skeleton */}
      <div className="flex-1 space-y-5">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-40" />

        <Skeleton className="h-64 w-full rounded-lg" />

        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/6" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
    </div>
  );
}
