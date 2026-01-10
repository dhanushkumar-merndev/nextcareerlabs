import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-5 w-96" />
      </div>

      <div className="space-y-6">
        {/* Toolbar Skeleton */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <Skeleton className="h-10 w-full sm:w-[300px] rounded-xl" />
          <Skeleton className="h-9 w-32 rounded-full" />
        </div>

        {/* Table Skeleton */}
        <div className="hidden lg:block rounded-2xl border bg-card/40 overflow-hidden border-border/40 shadow-xl">
          <div className="p-4 border-b border-border/40 bg-muted/40 flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
          </div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="p-4 border-b border-border/20 flex items-center justify-between">
               <div className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
               </div>
               <Skeleton className="h-4 w-40" />
               <Skeleton className="h-4 w-24" />
               <Skeleton className="h-4 w-24" />
               <Skeleton className="h-4 w-24" />
               <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          ))}
        </div>

        {/* Mobile Card Skeleton */}
         <div className="grid grid-cols-1 gap-4 lg:hidden">
            {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-card/40 border border-border/40 rounded-3xl p-5 space-y-5">
                    <div className="flex items-center gap-4">
                        <Skeleton className="h-12 w-12 rounded-full" />
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-24" />
                        </div>
                    </div>
                    <div className="space-y-2">
                         <Skeleton className="h-4 w-full" />
                         <Skeleton className="h-4 w-full" />
                    </div>
                </div>
            ))}
         </div>
      </div>
    </div>
  );
}
