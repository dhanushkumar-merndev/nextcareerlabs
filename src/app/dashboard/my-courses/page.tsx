
import { MyCoursesClient } from "./_components/MyCoursesClient";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";


export default function MyCoursesPage() {

  return (
    <div className="px-4 lg:px-6 pb-10 space-y-6">
      <h1 className="text-3xl font-bold">My Courses</h1>
      <p className="text-muted-foreground">Continue your learning journey.</p>

      <Suspense fallback={
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
             <Skeleton key={i} className="aspect-video w-full rounded-xl" />
          ))}
        </div>
      }>
        <MyCoursesClient />
      </Suspense>
    </div>
  );
}
