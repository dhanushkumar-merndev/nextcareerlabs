import { EmptyState } from "@/components/general/EmptyState";
import { getAllCourses } from "../data/course/get-all-courses";
import { getEnrolledCourses } from "../data/user/get-enrolled-courses";
import { PublicCourseCard } from "../(users)/_components/PublicCourseCard";

export default async function DashboardPage() {
  const [courses, enrolledCourses] = await Promise.all([
    getAllCourses(),
    getEnrolledCourses(),
  ]);

  // Extract enrolled course objects
  const enrolledCourseList = enrolledCourses.map((e) => e.Course);

  // Filter out already-enrolled courses
  const availableCourses = courses.filter(
    (course) => !enrolledCourseList.some((en) => en.id === course.id)
  );

  return (
    <div className="px-4 lg:px-6 space-y-12">
      {/* Enrolled Courses */}
      <div>
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold">Enrolled Courses</h1>
          <p className="text-muted-foreground">
            Here you can see all the courses you have enrolled in.
          </p>
        </div>

        {enrolledCourseList.length === 0 ? (
          <EmptyState
            title="No enrolled courses"
            description="You have not enrolled in any courses yet."
            buttonText="Browse Courses"
            href="/courses"
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
            {enrolledCourseList.map((course) => (
              <PublicCourseCard key={course.course.id} data={course.course} />
            ))}
          </div>
        )}
      </div>

      {/* Available Courses */}
      <section>
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold">Available Courses</h1>
          <p className="text-muted-foreground">
            Courses you can enroll in next.
          </p>
        </div>

        {availableCourses.length === 0 ? (
          <EmptyState
            title="No courses available"
            description="You have already enrolled in all available courses."
            buttonText="Browse Courses"
            href="/courses"
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
            {availableCourses.map((course) => (
              <PublicCourseCard key={course.id} data={course} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
