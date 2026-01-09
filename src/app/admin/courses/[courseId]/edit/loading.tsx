import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function Loading() {
  return (
    <div className="px-4 lg:px-6">
      {/* Header Section */}
      <div className="mb-3 md:mb-6 flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex items-center gap-2">
            {/* Back Button Skeleton */}
            <Skeleton className="h-10 w-10 shrink-0" />
            {/* "Edit Course:" Text Skeleton */}
            <Skeleton className="h-8 w-32" />
        </div>
        {/* Dynamic Title Skeleton */}
        <Skeleton className="h-8 w-48 mt-4 md:mt-0 mb-2 md:mb-0 sm:ml-2" />
      </div>

      <div className="w-full space-y-4">
        {/* Tabs List Skeleton (2 cols) */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-md h-10 w-full mb-6">
             <div className="bg-background rounded-sm h-full w-full opacity-0"></div>
             <div className="rounded-sm h-full w-full"></div>
        </div>

        {/* Tab Content (Card) */}
        <Card>
          <CardHeader className="space-y-2">
            <Skeleton className="h-6 w-48" /> {/* Card Title */}
            <Skeleton className="h-4 w-96 max-w-full" /> {/* Card Description */}
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Mock Form Fields */}
            <div className="space-y-2">
                <Skeleton className="h-4 w-20" /> {/* Label */}
                <Skeleton className="h-10 w-full" /> {/* Input */}
            </div>
            
            <div className="space-y-2">
                <Skeleton className="h-4 w-24" /> {/* Label */}
                <Skeleton className="h-10 w-full" /> {/* Input */}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="space-y-2">
                    <Skeleton className="h-4 w-20" /> 
                    <Skeleton className="h-10 w-full" /> 
                </div>
                 <div className="space-y-2">
                    <Skeleton className="h-4 w-20" /> 
                    <Skeleton className="h-10 w-full" /> 
                </div>
            </div>

            <div className="space-y-2">
                <Skeleton className="h-4 w-32" /> {/* Label */}
                <Skeleton className="h-32 w-full" /> {/* Textarea */}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
