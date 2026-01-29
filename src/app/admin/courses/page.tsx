import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { AdminCoursesClient } from "./_components/AdminCoursesClient";
import { AdminCourseSearch } from "./_components/AdminCourseSearch";

export const dynamic = 'force-dynamic';

export default async function CoursePage() {
  return (
    <div className="px-4 lg:px-6 lg:py-3">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mt-3 mb-10 gap-4">
        <div className="flex flex-col space-y-1">
          <h1 className="text-2xl font-bold">Your Courses</h1>
          <p className="text-sm text-muted-foreground">Manage and create your courses here.</p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <AdminCourseSearch />
          <Link className={buttonVariants()} href="/admin/courses/create">
            Create Course
          </Link>
        </div>
      </div>

      <AdminCoursesClient />
    </div>
  );
}
