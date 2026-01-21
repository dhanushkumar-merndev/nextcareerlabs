import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <Skeleton className="h-8 w-40" />
      </div>

      {/* Stats Cards Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-[100px] rounded-xl" />
        <Skeleton className="h-[100px] rounded-xl" />
        <Skeleton className="h-[100px] rounded-xl" />
        <Skeleton className="h-[100px] rounded-xl" />
      </div>

      {/* Courses Section */}
      <div className="space-y-6 pt-6">
        <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex flex-col gap-4">
             <Skeleton className="h-32 w-full rounded-2xl" />
             <Skeleton className="h-32 w-full rounded-2xl" />
             <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
