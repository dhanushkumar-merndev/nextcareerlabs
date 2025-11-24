import { ChartAreaInteractive } from "@/components/sidebar/chart-area-interactive";

import { SectionCards } from "@/components/sidebar/section-cards";
import { adminGetDashboardStats } from "../data/admin/admin-get-dashboard-stats";
import { adminGetEnrollmentsStats } from "../data/admin/admin-get-enrollments-stats";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { adminGetRecentCourses } from "../data/admin/admin-get-recent-course";
import { EmptyState } from "@/components/general/EmptyState";
import {
  AdminCourseCard,
  AdminCourseCardSkeleton,
} from "./courses/_components/AdminCourseCard";
import { Suspense } from "react";
export default async function AdminIndexPage() {
  const stats = await adminGetDashboardStats();
  const enrollments = await adminGetEnrollmentsStats();
  return (
    <>
      <SectionCards stats={stats} />
      <div className="px-4 lg:px-6 ">
        <ChartAreaInteractive data={enrollments} />
        <div className="space-y-4 mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold ">Recent Courses</h2>
            <Link
              href="/admin/courses"
              className={buttonVariants({ variant: "outline" })}
            >
              View All Courses
            </Link>
          </div>
          <Suspense fallback={<RenderRecentCoursesSkeletonLayout />}>
            <RenderRecentCourses />
          </Suspense>
        </div>
      </div>
    </>
  );
}

async function RenderRecentCourses() {
  const data = await adminGetRecentCourses();
  if (data.length === 0) {
    return (
      <EmptyState
        buttonText="create new course"
        description="No recent courses found."
        title="you dont have any courses yet. Please create one"
        href="/admin/courses/create"
      />
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {data.map((course) => (
        <AdminCourseCard key={course.id} data={course} />
      ))}
    </div>
  );
}

function RenderRecentCoursesSkeletonLayout() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {[1, 2, 3, 4, 5, 6].map((_, index) => (
        <AdminCourseCardSkeleton key={index} />
      ))}
    </div>
  );
}
