import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { AdminCoursesClient } from "./_components/AdminCoursesClient";

export const dynamic = 'force-dynamic';

export default async function CoursePage() {
  return (
    <div className="px-4 lg:px-6 lg:py-3">
      <div className="flex items-center justify-between mt-3 mb-7">
        <h1 className="text-2xl font-bold">Your Courses</h1>
        <Link className={buttonVariants()} href="/admin/courses/create">
          Create Course
        </Link>
      </div>

      <AdminCoursesClient />
    </div>
  );
}
