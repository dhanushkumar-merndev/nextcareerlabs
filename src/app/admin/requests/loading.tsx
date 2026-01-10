import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";

export default function LoadingAdminRequestsPage() {
  return (
    <div className="flex flex-col gap-4 sm:gap-6 px-4 sm:px-6 py-4 sm:py-6">
      {/* Heading */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <Card className="overflow-hidden">
        {/* Card header */}
        <CardHeader className="space-y-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </CardHeader>

        <CardContent className="px-0 lg:px-6">
          {/* DESKTOP TABLE SKELETON */}
          <div className="hidden lg:block overflow-hidden">
             <div className="border-b">
              <div className="grid grid-cols-6 gap-4 py-4 px-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            </div>
            
            <div className="divide-y">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="grid grid-cols-6 gap-4 items-center py-4 px-6">
                  <div className="flex items-center gap-3 col-span-2">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-40" />
                    </div>
                  </div>
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-6 w-24 rounded-full" />
                  <div className="flex gap-2 justify-end">
                    <Skeleton className="h-8 w-8 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* MOBILE CARD SKELETON */}
          <div className="grid grid-cols-1 gap-4 lg:hidden p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="p-5 space-y-5 bg-card/40 border-border/40 rounded-3xl animate-pulse">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
                <div className="space-y-3 py-5 border-y border-border/20">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div key={j} className="flex justify-between">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <Skeleton className="h-8 w-8 rounded-full" />
                </div>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
