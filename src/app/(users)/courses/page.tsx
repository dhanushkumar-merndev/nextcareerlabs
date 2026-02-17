/**
 * PublicCoursesRoute
 *
 * Server component that renders the public courses listing page.
 *
 * - Fetches the current user on the server
 * - Passes userId to client component for personalization
 * - Forces dynamic rendering (no static caching)
 * - Renders search and infinite-scroll course list
 */

import { CoursesClient } from "./_components/CoursesClient";
import { CourseSearch } from "./_components/CourseSearch";
import { getAllCoursesAction } from "./actions";
import { Suspense } from "react";
import { PublicCourseCardSkeleton } from "../_components/PublicCourseCard";

// Helper for local skeleton grid
function CoursesSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
      {Array.from({ length: 9 }).map((_, i) => (
        <PublicCourseCardSkeleton key={i} />
      ))}
    </div>
  );
}

export default async function PublicCoursesRoute() {
  // 🔹 Fetch initial courses for guests/first-paint on the server.
  // Since we removed 'force-dynamic', this page can be statically pre-rendered (ISR).
  // The 'user' is now handled on the client in CoursesClient.
  const initialData = await getAllCoursesAction(undefined, undefined);

  return (
    <div className="mt-5 px-4 lg:px-6 md:mb-40">
      {/* Header + Search */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
        <div className="flex flex-col space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tighter">
            Explore Courses
          </h1>
          <p className="text-muted-foreground">
            Discover our wide range of courses designed to help you achieve your
            learning goals.
          </p>
        </div>

        {/* Course search input */}
        <CourseSearch />
      </div>

      {/* Courses list - Rendered inside Suspense to avoid blocking the shell */}
      <Suspense fallback={<CoursesSkeleton />}>
        <CoursesClient initialData={initialData} />
      </Suspense>
    </div>
  );
}

