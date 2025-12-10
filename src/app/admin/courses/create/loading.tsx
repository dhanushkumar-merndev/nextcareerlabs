import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="px-4 lg:px-6 flex flex-col gap-4 py-4">
      {/* Header row */}
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-md" />{" "}
        {/* Back button skeleton */}
        <Skeleton className="h-6 w-48" /> {/* Title */}
      </div>

      {/* Card wrapper */}
      <div className="border rounded-xl p-6 space-y-6">
        {/* Card header */}
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>

        {/* Form fields */}
        <div className="space-y-6">
          {/* Title */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>

          {/* Slug + Button */}
          <div className="flex gap-4">
            <div className="w-full space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full" />
            </div>
            <Skeleton className="h-10 w-32" />
          </div>

          {/* Small description */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-24 w-full" />
          </div>

          {/* Description editor */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-40 w-full" />
          </div>

          {/* Thumbnail upload */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-40 w-full" />
          </div>

          {/* Category + Level + Duration + Price */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>

          {/* Submit button */}
          <Skeleton className="h-10 w-40" />
        </div>
      </div>
    </div>
  );
}
