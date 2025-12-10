import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="max-w-xl mx-auto w-full">
      <div className="border rounded-xl mt-32 p-6 space-y-6">
        {/* Card Header */}
        <div className="space-y-2">
          <Skeleton className="h-6 w-64" /> {/* Title */}
          <Skeleton className="h-4 w-48" /> {/* Description */}
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-24 rounded-md" />
          <Skeleton className="h-10 w-28 rounded-md" />
        </div>
      </div>
    </div>
  );
}
