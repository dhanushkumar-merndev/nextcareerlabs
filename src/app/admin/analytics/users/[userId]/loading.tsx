import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

export default function Loading() {
  return (
    <div className="flex flex-col gap-8 p-4 lg:p-6 w-full">
      {/* Header & Breadcrumb Skeleton */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-4 w-24" />
        </div>
        
        <div className="flex items-center gap-5">
            <Skeleton className="size-20 rounded-full border-4 border-muted" />
            <div className="flex flex-col gap-2">
                <Skeleton className="h-9 w-48" />
                <div className="flex items-center gap-3">
                    <Skeleton className="h-6 w-16 rounded-full" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-24" />
                </div>
            </div>
        </div>
      </div>

      <Separator className="bg-border/40" />

      {/* Stats Skeleton */}
      <div className="grid gap-6 md:grid-cols-3">
        {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl border p-6 space-y-4">
                <div className="flex flex-row items-center justify-between">
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-10 w-16" />
                    </div>
                    <Skeleton className="size-10 rounded-md" />
                </div>
                <Skeleton className="h-4 w-32" />
            </div>
        ))}
      </div>

      {/* Progress Skeleton */}
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-64" />
        </div>

        <div className="grid gap-4">
            {[...Array(3)].map((_, i) => (
                <div key={i} className="border rounded-xl p-5 flex flex-col md:flex-row gap-6 items-center">
                    <Skeleton className="w-full md:w-32 aspect-video rounded-lg" />
                    <div className="flex-1 space-y-4 w-full">
                        <div className="flex justify-between items-start">
                             <div className="space-y-2">
                                <Skeleton className="h-6 w-48" />
                                <Skeleton className="h-3 w-32" />
                             </div>
                             <Skeleton className="h-8 w-12" />
                        </div>
                        <Skeleton className="h-2.5 w-full rounded-full" />
                    </div>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
}
