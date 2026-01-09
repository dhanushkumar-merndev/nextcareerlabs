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

        <CardContent className="px-0 sm:px-6">
          {/* Table Header Row */}
          <div className="border-b px-4 sm:px-0">
            <div className="grid grid-cols-6 gap-4 py-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          </div>

          {/* Table Body Rows */}
          <div className="divide-y">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-6 gap-4 items-center px-4 sm:px-0 py-4"
              >
                {/* User */}
                <div className="flex items-center gap-3 col-span-2">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>

                {/* Course */}
                <Skeleton className="h-4 w-32" />

                {/* Requested At */}
                <Skeleton className="h-4 w-24" />

                {/* Status */}
                <Skeleton className="h-6 w-20 rounded-full" />

                {/* Actions */}
                <div className="flex gap-2 justify-end">
                  <Skeleton className="h-8 w-20 rounded-md" />
                  <Skeleton className="h-8 w-20 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
