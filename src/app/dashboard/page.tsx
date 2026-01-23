import { getUserDashboardData } from "@/app/dashboard/actions";
import { AnalyticsCard } from "@/components/analytics/AnalyticsCard";
import { HorizontalCourseCard } from "@/app/dashboard/_components/HorizontalCourseCard";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
          description="Successfully finished"
        />
        <AnalyticsCard
          title="Chapters Finished"
          value={data.completedChaptersCount}
          icon="layers"
          description="Milestones reached"
        />
        <AnalyticsCard
          title="Lessons Finished"
          value={data.totalCompletedLessons}
          icon="check-circle"
          description="Total content consumption"
        />
      </div>

      <div className="space-y-6 pt-6">
        <div className="flex flex-col gap-1">
            <h3 className="text-xl font-black tracking-tight text-foreground uppercase">
                Course Progress
            </h3>
            <p className="text-sm text-muted-foreground/60 font-medium">
                Detailed breakdown of learning progress for each course.
            </p>
        </div>

        {data.coursesProgress.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 rounded-3xl border border-dashed border-border/20 bg-muted/5">
             <p className="text-muted-foreground font-medium italic">You are not enrolled in any courses yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {data.coursesProgress.map((course) => (
              <HorizontalCourseCard
                key={course.id}
                course={course as any}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
