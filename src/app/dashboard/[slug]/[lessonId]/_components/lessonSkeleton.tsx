import { Skeleton } from "@/components/ui/skeleton";
import Loader from "@/components/ui/Loader";

export function LessonContentSkeleton() {
  return (
    <div className="relative flex flex-col min-[1025px]:flex-row bg-background min-[1025px]:h-full overflow-hidden min-[1025px]:border-l border-border">
      <div className="flex-1 flex flex-col min-[1025px]:pl-6 min-[1025px]:overflow-y-auto">
        {/* Video Area */}
        <div className="order-1 min-[1025px]:order-1 w-full relative">
          <div className="aspect-video relative min-[1025px]:rounded-lg rounded-none overflow-hidden bg-muted border min-[1025px]:border-border border-transparent">
            <Skeleton className="w-full h-full" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader size={32} />
            </div>
          </div>
        </div>

        {/* Desktop Title */}
        <div className="hidden min-[1025px]:block order-3 min-[1025px]:order-2 pt-6 min-[1025px]:pt-3 min-[1025px]:pb-4">
          <Skeleton className="h-8 min-[1025px]:h-10 w-2/3 rounded-lg" />
        </div>

        {/* Mobile Header Buttons */}
        <div className="min-[1025px]:hidden order-2 flex items-center justify-between py-4 bg-background px-4">
          <Skeleton className="h-9 w-32 rounded-full" />
          <div className="flex items-center gap-2">
            <Skeleton className="size-10 rounded-full" />
            <Skeleton className="size-10 rounded-full" />
          </div>
        </div>

        {/* Action Buttons Row */}
        <div className="hidden min-[1025px]:flex order-3 min-[1025px]:order-3 items-center justify-between gap-4 pt-6 pb-6 border-t mt-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-40 rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-40 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
