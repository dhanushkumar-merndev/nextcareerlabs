import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-10 w-32" />
      </div>

      {/* User Profile Header Skeleton */}
      <div className="flex items-start space-x-4 p-6 border rounded-xl bg-card shadow-sm">
        <Skeleton className="h-20 w-20 rounded-full" />
        <div className="space-y-3 pt-2">
            <Skeleton className="h-8 w-48" />
            <div className="flex items-center gap-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
            </div>
        </div>
      </div>

    

      <div className="space-y-4">
        <Skeleton className="h-7 w-36" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
             {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
        </div>
      </div>
    </div>
  );
}
