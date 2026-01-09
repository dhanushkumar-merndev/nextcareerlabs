import { EmptyState } from "@/components/general/EmptyState";
import { getAllCourses } from "@/app/data/course/get-all-courses";
import { getEnrolledCourses } from "@/app/data/user/get-enrolled-courses";
import { PublicCourseCard } from "../../(users)/_components/PublicCourseCard";

export default async function AvailableCoursesPage() {
  const [courses, enrolledCourses] = await Promise.all([
    getAllCourses(),
    getEnrolledCourses(),
  ]);

  const enrolledIds = enrolledCourses.map((e) => e.Course.id);
  const availableCourses = courses.filter(
    (course) => !enrolledIds.includes(course.id)
  );

  return (
    <div className="px-4 lg:px-6 pb-10 space-y-6">
      <h1 className="text-3xl font-bold">Available Courses</h1>
      <p className="text-muted-foreground">
        Courses you can enroll in right now.
      </p>

      {availableCourses.length === 0 ? (
        <EmptyState
          title="No courses available"
          description="You have already enrolled in all courses."
          buttonText="Back to Analytics"
          href="/dashboard"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {availableCourses.map((course) => (
            <PublicCourseCard key={course.id} data={course} />
          ))}
        </div>
      )}
    </div>
  );
}
