import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="px-4 lg:px-6 py-4 space-y-6">
      {/* Back Button */}
      <div>
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Card */}
      <div className="border rounded-xl p-6 space-y-6">
        {/* Card Header */}
        <div className="space-y-2">
          <Skeleton className="h-5 w-56" /> {/* Title */}
          <Skeleton className="h-4 w-80" /> {/* Description */}
        </div>

        {/* Lesson Name */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" /> {/* Label */}
          <Skeleton className="h-10 w-full" /> {/* Input */}
        </div>

        {/* Description Editor */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-40 w-full rounded-md" />
        </div>

        {/* Thumbnail Upload */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-40 w-full rounded-md" />
        </div>

        {/* Video Upload */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-40 w-full rounded-md" />
        </div>

        {/* Submit Button */}
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
    </div>
  );
}
