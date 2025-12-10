import { ChartAreaInteractive } from "@/components/sidebar/chart-area-interactive";
import { SectionCards } from "@/components/sidebar/section-cards";
import { adminGetDashboardStats } from "../data/admin/admin-get-dashboard-stats";
import { adminGetEnrollmentsStats } from "../data/admin/admin-get-enrollments-stats";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { adminGetRecentCourses } from "../data/admin/admin-get-recent-course";
import { EmptyState } from "@/components/general/EmptyState";
import { AdminCourseCard } from "./courses/_components/AdminCourseCard";

export default async function AdminIndexPage() {
  const stats = await adminGetDashboardStats();
  const enrollments = await adminGetEnrollmentsStats();
  const courses = await adminGetRecentCourses();

  return (
    <>
      <SectionCards stats={stats} />

      <div className="px-4 lg:px-6">
        <ChartAreaInteractive data={enrollments} />

        <div className="space-y-4 mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Recent Courses</h2>
            <Link
              href="/admin/courses"
              className={buttonVariants({ variant: "outline" })}
            >
              View All Courses
            </Link>
          </div>

          {courses.length === 0 ? (
            <EmptyState
              buttonText="Create New Course"
              description="No recent courses found."
              title="You don't have any courses yet. Please create one."
              href="/admin/courses/create"
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map((course) => (
                <AdminCourseCard key={course.id} data={course} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
