import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="px-4 lg:px-6 py-6 space-y-8">
      {/* Header with Back Button + Title */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-md" />
        <Skeleton className="h-8 w-64" />
      </div>

      {/* Tabs */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>

        {/* Card Skeleton */}
        <div className="border rounded-xl p-6 space-y-6">
          {/* Card header */}
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" /> {/* Title */}
            <Skeleton className="h-4 w-80" /> {/* Description */}
          </div>

          {/* Form content skeleton (basic info or structure) */}
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
