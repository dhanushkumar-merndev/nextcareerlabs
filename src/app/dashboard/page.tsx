import { getUserDashboardData } from "@/app/admin/analytics/analytics";
import { AnalyticsCard } from "@/components/analytics/AnalyticsCard";
import { CourseProgressCard } from "@/components/dashboard/CourseProgressCard";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/auth/sign-in");
  }

  const data = await getUserDashboardData(user.id);

  if (!data) {
      return <div>Failed to load dashboard data.</div>;
  }

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <AnalyticsCard
          title="Enrolled Courses"
          value={data.enrolledCoursesCount}
          icon="book-text"
          description="Active learning paths"
        />
         <AnalyticsCard
          title="Completed Courses"
          value={data.completedCoursesCount}
          icon="circle-check"
          description="Fully finished courses"
        />
        <AnalyticsCard
          title="Average Progress"
           // Calculate average progress
          value={`${data.enrolledCoursesCount > 0 ? Math.round(data.coursesProgress.reduce((acc, c) => acc + c.progress, 0) / data.enrolledCoursesCount) : 0}%`}
          icon="clipboard-check"
          description="Across all courses"
        />
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold">My Learning</h3>
        {data.coursesProgress.length === 0 ? (
            <p className="text-muted-foreground">You are not enrolled in any courses yet.</p>
        ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {data.coursesProgress.map((course) => (
                    <CourseProgressCard
                        key={course.id}
                        title={course.title}
                        progress={course.progress}
                        slug={course.slug}
                        completedLessons={course.completedLessons}
                        totalLessons={course.totalLessons}
                    />
                ))}
            </div>
        )}
      </div>
    </div>
  );
}
