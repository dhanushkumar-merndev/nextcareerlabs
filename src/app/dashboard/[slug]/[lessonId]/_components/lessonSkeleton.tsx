import { Skeleton } from "@/components/ui/skeleton";
import Loader from "@/components/ui/Loader";

export function LessonContentSkeleton() {
  return (
    <div className="relative flex flex-col md:flex-row bg-background md:h-full overflow-hidden md:border-l border-border">
      <div className="flex-1 flex flex-col md:pl-6 md:overflow-y-auto">
        {/* Video Area */}
        <div className="order-1 md:order-1 w-full relative">
          <div className="aspect-video relative md:rounded-lg rounded-none overflow-hidden bg-muted border md:border-border border-transparent">
            <Skeleton className="w-full h-full" />
            <div className="absolute inset-0 flex items-center justify-center">
                <Loader size={32} />
            </div>
          </div>
        </div>

        {/* Desktop Title */}
        <div className="hidden md:block order-3 md:order-2 pt-6 md:pt-3 md:pb-4">
          <Skeleton className="h-8 md:h-10 w-2/3 rounded-lg" />
        </div>

        {/* Mobile Header Buttons */}
        <div className="md:hidden order-2 flex items-center justify-between py-4 bg-background px-4">
           <Skeleton className="h-9 w-32 rounded-full" />
           <Skeleton className="size-10 rounded-full" />
        </div>

        {/* Action Buttons Row */}
        <div className="hidden md:flex order-3 md:order-3 items-center justify-between gap-4 pt-6 pb-6 border-t mt-2">
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
