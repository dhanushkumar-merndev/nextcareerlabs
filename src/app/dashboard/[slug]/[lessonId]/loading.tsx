import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col h-full bg-background md:pl-4 lg:pl-6">
      {/* ======================= */}
      {/* VIDEO SKELETON */}
      {/* ======================= */}
      <div className="aspect-video w-full">
        <Skeleton className="w-full h-full rounded-lg" />
      </div>

      {/* ======================= */}
      {/* BUTTON SKELETON */}
      {/* ======================= */}
      <div className="py-4 border-b border-border bg-background">
        <Skeleton className="h-10 w-40 rounded-md" />
      </div>

      {/* ======================= */}
      {/* TEXT CONTENT */}
      {/* ======================= */}
      <div className="space-y-4 pt-4 pb-10">
        {/* Title */}
        <Skeleton className="h-7 w-2/3 rounded" />

        {/* Paragraph lines */}
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="h-4 w-5/6 rounded" />
        <Skeleton className="h-4 w-4/6 rounded" />

        {/* Additional paragraph block */}
        <div className="space-y-2 mt-4">
          <Skeleton className="h-4 w-5/6 rounded" />
          <Skeleton className="h-4 w-4/6 rounded" />
          <Skeleton className="h-4 w-3/6 rounded" />
        </div>
      </div>
    </div>
  );
}
