import { adminGetCourses } from "@/app/data/admin/admin-get-courses";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { AdminCourseCard } from "./_components/AdminCourseCard";
import { EmptyState } from "@/components/general/EmptyState";

export const dynamic = 'force-dynamic';

export default async function CoursePage() {
  const data = await adminGetCourses();

  return (
    <div className="px-4  lg:px-6 lg:py-3">
      <div className="flex items-center justify-between mt-3 mb-7">
        <h1 className="text-2xl font-bold">Your Courses</h1>
        <Link className={buttonVariants()} href="/admin/courses/create">
          Create Course
        </Link>
      </div>

      {data.length === 0 ? (
        <EmptyState
          title="No courses found"
          description="Create a new course to get started."
          buttonText="Create Course"
          href="/admin/courses/create"
        />
      ) : (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3
           gap-7"
        >
          {data.map((course) => (
            <AdminCourseCard key={course.id} data={course} />
          ))}
        </div>
      )}
    </div>
  );
}
