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
      <div className="py-4  bg-background">
        <Skeleton className="h-10 w-40 rounded-md" />
      </div>
    </div>
  );
}
