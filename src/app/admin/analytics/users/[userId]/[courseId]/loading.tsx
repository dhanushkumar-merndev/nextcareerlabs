import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

export default function Loading() {
    return (
        <div className="flex flex-col gap-8 p-4 lg:p-6 w-full">
            {/* Breadcrumb Skeleton */}
            <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-4 w-32" />
            </div>

            {/* Header Skeleton */}
            <div className="flex items-center gap-5">
                <Skeleton className="size-16 rounded-full" />
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="h-5 w-48" />
                </div>
            </div>

            <Separator className="bg-border/40" />

            {/* Content Skeletons */}
            <div className="flex flex-col gap-8">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                            <Skeleton className="size-8 rounded-full" />
                            <Skeleton className="h-6 w-48" />
                        </div>
                        <div className="grid gap-3">
                            {[1, 2].map((j) => (
                                <Skeleton key={j} className="h-20 w-full rounded-xl" />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
