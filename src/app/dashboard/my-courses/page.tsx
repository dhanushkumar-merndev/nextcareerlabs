import { EmptyState } from "@/components/general/EmptyState";
import { getEnrolledCourses } from "@/app/data/user/get-enrolled-courses";
import { CourseProgressCard } from "../_components/CourseProgressCard";

export default async function MyCoursesPage() {
  const enrolledCourses = await getEnrolledCourses();

  return (
    <div className="px-4 lg:px-6 pb-10 space-y-6">
      <h1 className="text-3xl font-bold">My Courses</h1>
      <p className="text-muted-foreground">Continue your learning journey.</p>

      {enrolledCourses.length === 0 ? (
        <EmptyState
          title="No courses enrolled"
          description="You haven't enrolled in any courses yet."
          buttonText="Browse Courses"
          href="/dashboard/available-courses"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {enrolledCourses.map((e) => (
            <CourseProgressCard key={e.Course.id} data={e} />
          ))}
        </div>
      )}
    </div>
  );
}
