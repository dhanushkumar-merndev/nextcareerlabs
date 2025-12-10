import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="px-4 lg:px-6 py-10 space-y-10">
      {/* Title + Subtitle */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Two cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-xl">
        <div className="p-6 border rounded-xl space-y-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>

        <div className="p-6 border rounded-xl space-y-3">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-52" />
        </div>
      </div>
    </div>
  );
}
