import { AvailableCoursesClient } from "./_components/AvailableCoursesClient";
import { CourseSearch } from "../../(users)/courses/_components/CourseSearch";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AvailableCoursesPage() {
  const user = await getCurrentUser();

  return (
    <div className="px-4 lg:px-6 pb-10 space-y-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold">Available Courses</h1>
          <p className="text-muted-foreground">
            Courses you can enroll in right now.
          </p>
        </div>
        <CourseSearch />
      </div>

      <AvailableCoursesClient currentUserId={user?.id} />
    </div>
  );
}
