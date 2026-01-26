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
import { getCurrentUser } from "@/lib/session";

// Ensure this route is always dynamically rendered
export const dynamic = "force-dynamic";

export default async function PublicCoursesRoute() {
  // Get authenticated user (if any)
  const user = await getCurrentUser();

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

      {/* Courses list */}
      <CoursesClient currentUserId={user?.id} />
    </div>
  );
}
